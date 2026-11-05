'use strict';
/*
 * Local WhatsApp session handling.
 *
 * ensureSession(SESSION_ID) is called by the bot at start-up and makes sure the database holds a
 * logged-in WhatsApp session for that ID:
 *
 *   1. A session is already stored in the database       -> nothing to do (normal restart).
 *   2. SESSION_DATA env var is set (base64 / JSON creds)  -> import it into the database.
 *   3. A session site is configured (SESSION_API)         -> download the session for SESSION_ID from it.
 *   4. Otherwise (or if the site is unreachable and PAIR_NUMBER is set) -> log in here and now:
 *        - PAIR_NUMBER set (e.g. 919876543210)  -> an 8-letter pairing code is printed in the logs,
 *          type it in WhatsApp > Linked devices > Link a device > "Link with phone number instead".
 *        - PAIR_NUMBER not set                  -> a QR code is printed in the logs instead.
 *
 * SESSION_API = your own session site, requested as   GET <SESSION_API>?id=<SESSION_ID>
 * (or put {id} inside the URL: https://site.com/session/{id}). It must answer with JSON, either
 *   the Baileys creds.json itself                       { "noiseKey": {...}, "signedIdentityKey": {...}, ... }
 *   or wrapped                                          { "status": true, "creds": { ... } }  (also "data" / "session" / "result")
 *   or a full map with the keys too                     { "creds": {...}, "pre-key-1": {...}, ... }
 *   or the same thing as a base64 string.
 * Once downloaded the session is kept in the database, so the site is only needed on the first start.
 *
 * Without SESSION_API, SESSION_ID is just a name for the session row in your database.
 * Keep it the same on every start and keep using the same DATABASE_URL.
 *
 * The data is stored with the same keys the bot's original auth code (initMultiAuthState.core.js)
 * reads, so everything after the login works exactly as before.
 */
const fs = require('fs');
const path = require('path');
const core = require('./initMultiAuthState.core');
const { getcreds, savecreds, setsession, getsession, delsession } = require('./database/creds');

const log = (...a) => console.log('[session]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 30;

// Put your session site here once (or use the SESSION_API variable) so users only have to set SESSION_ID.
// Example: 'https://my-session-site.com/authentication'
const DEFAULT_SESSION_API = 'https://pair-site-ps6x.onrender.com/session';

const silentLogger = {
	level: 'silent',
	trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
	child() { return silentLogger; },
};

let baileysPromise = null;
const loadBaileys = () => baileysPromise || (baileysPromise = import('baileys'));
const pick = (mod, name) => (mod[name] !== undefined ? mod[name] : mod.default && mod.default[name]);

// ---------------------------------------------------------------------------------------------
// helpers around what is stored in the database
// ---------------------------------------------------------------------------------------------

async function readStoredCreds(id) {
	const { BufferJSON } = await getApi();
	const raw = await getsession('creds', id);
	if (!raw) return null;
	try {
		const value = JSON.parse(raw, BufferJSON.reviver);
		return value && value.noiseKey ? value : null;
	} catch (e) {
		return null;
	}
}

// The bot decides "a session exists" by looking at the Creds table, so write a row there too.
async function markStored(id, creds) {
	const { BufferJSON } = await getApi();
	await savecreds(JSON.stringify({ creds }, BufferJSON.replacer), id);
}

async function getApi() {
	const b = await loadBaileys();
	const makeWASocket = typeof b.default === 'function' ? b.default : (b.default && b.default.default) || b.makeWASocket;
	return {
		makeWASocket,
		BufferJSON: pick(b, 'BufferJSON'),
		initAuthCreds: pick(b, 'initAuthCreds'),
		DisconnectReason: pick(b, 'DisconnectReason') || {},
		makeCacheableSignalKeyStore: pick(b, 'makeCacheableSignalKeyStore'),
		Browsers: pick(b, 'Browsers'),
		fetchLatestBaileysVersion: pick(b, 'fetchLatestBaileysVersion'),
	};
}

// ---------------------------------------------------------------------------------------------
// 2. import an existing session (SESSION_DATA)
// ---------------------------------------------------------------------------------------------

function parseText(text) {
	text = String(text).trim();
	if (!text) return null;
	if (!text.startsWith('{')) {
		try { text = Buffer.from(text, 'base64').toString('utf8').trim(); } catch (e) { return null; }
	}
	try { return JSON.parse(text); } catch (e) { return null; }
}

// store a parsed session ({ creds: {...}, "pre-key-1": {...} } or a plain creds.json) in the database
async function importSessionObject(id, parsed) {
	const { BufferJSON } = await getApi();
	// make sure Buffers are real Buffers (works for {type:'Buffer', data:'base64'} and {type:'Buffer', data:[...]})
	let obj = JSON.parse(JSON.stringify(parsed), BufferJSON.reviver);
	const map = obj && obj.noiseKey ? { creds: obj } : obj;
	if (map && typeof map.creds === 'string') map.creds = JSON.parse(map.creds, BufferJSON.reviver);
	if (!map || !map.creds || !map.creds.noiseKey) return false;
	for (const [key, value] of Object.entries(map)) {
		if (value === null || value === undefined) continue;
		let v = value;
		if (typeof v === 'string') {
			try { v = JSON.parse(v, BufferJSON.reviver); } catch (e) { /* keep as text */ }
		}
		await setsession(v, key, id);
	}
	await savecreds(JSON.stringify(map, BufferJSON.replacer), id);
	return true;
}

async function importSession(id, raw) {
	const parsed = parseText(raw);
	if (!parsed) {
		log('SESSION_DATA is not valid JSON / base64 JSON.');
		return false;
	}
	let ok = false;
	try { ok = await importSessionObject(id, parsed); } catch (e) { log('SESSION_DATA could not be read:', e.message); }
	if (!ok) log('SESSION_DATA does not contain WhatsApp credentials.');
	else log('Imported session from SESSION_DATA.');
	return ok;
}

// ---------------------------------------------------------------------------------------------
// 3. download the session from your own session site (SESSION_API)
// ---------------------------------------------------------------------------------------------

function httpGetJson(url, redirects = 3) {
	return new Promise((resolve, reject) => {
		let u;
		try { u = new URL(url); } catch (e) { return reject(new Error('SESSION_API is not a valid URL')); }
		const client = u.protocol === 'http:' ? require('http') : require('https');
		const req = client.get(u, { headers: { 'user-agent': 'hermit-md', accept: 'application/json' }, timeout: 20000 }, (res) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
				res.resume();
				return resolve(httpGetJson(new URL(res.headers.location, u).toString(), redirects - 1));
			}
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => {
				const text = Buffer.concat(chunks).toString('utf8');
				let body;
				try { body = JSON.parse(text); } catch (e) { body = text; }
				resolve({ status: res.statusCode, body });
			});
		});
		req.on('timeout', () => req.destroy(new Error('timeout')));
		req.on('error', reject);
	});
}

// find the creds inside the answer of the site
function unwrapSession(body) {
	let v = body;
	for (let i = 0; i < 4; i++) {
		if (typeof v === 'string') {
			v = parseText(v);
			continue;
		}
		if (v && typeof v === 'object') {
			if (v.noiseKey || v.creds) return v;
			const inner = v.data !== undefined ? v.data : v.session !== undefined ? v.session : v.result !== undefined ? v.result : v.auth;
			if (inner === undefined) return v;
			v = inner;
			continue;
		}
		break;
	}
	return v;
}

async function fetchRemoteSession(id, api) {
	const url = api.includes('{id}')
		? api.replace('{id}', encodeURIComponent(id))
		: api + (api.includes('?') ? '&' : '?') + 'id=' + encodeURIComponent(id);
	const shown = api.replace(/\?.*$/, '');

	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const { status, body } = await httpGetJson(url);
			if (status >= 500) throw new Error('session site error ' + status);
			if (status >= 400 || (body && typeof body === 'object' && (body.status === false || body.error))) {
				const reason = body && typeof body === 'object' ? (body.message || body.error || '') : '';
				log('The session site refused this SESSION_ID (' + (reason || 'HTTP ' + status) + ').');
				return false; // wrong / unknown ID: retrying will not help
			}
			const session = unwrapSession(body);
			if (!session || typeof session !== 'object' || !(await importSessionObject(id, session))) {
				log('The session site answered, but there are no WhatsApp credentials in the answer.');
				return false;
			}
			log('Session downloaded from ' + shown + ' and saved to the database.');
			return true;
		} catch (e) {
			log('Could not reach the session site (' + e.message + ') - try ' + attempt + ' of 3.');
			if (attempt < 3) await sleep(3000);
		}
	}
	return false;
}

// ---------------------------------------------------------------------------------------------
// 3. log in with a pairing code / QR
// ---------------------------------------------------------------------------------------------

function printCode(code) {
	const pretty = String(code).match(/.{1,4}/g).join('-');
	console.log([
		'',
		'==============================================================',
		'   WHATSAPP PAIRING CODE:   ' + pretty,
		'',
		'   On your phone: WhatsApp > Settings > Linked devices >',
		'   Link a device > "Link with phone number instead"',
		'   then type the code above. (It is valid for about a minute;',
		'   a new one is printed here if it expires.)',
		'==============================================================',
		'',
	].join('\n'));
}

function printQr(qr) {
	log('Scan this QR with WhatsApp > Linked devices > Link a device:');
	try {
		require('qrcode-terminal').generate(qr, { small: true });
	} catch (e) {
		log('(qrcode-terminal not available) raw QR data:', qr);
	}
}

async function runSocket(id, phone, api) {
	const { makeWASocket, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, Browsers, fetchLatestBaileysVersion } = api;

	// start from a fresh (unregistered) credential set if nothing usable is stored yet
	if (!(await readStoredCreds(id))) await setsession(initAuthCreds(), 'creds', id);
	const { state, saveCreds } = await core.initMultiAuthState(id);

	let version;
	try { version = (await fetchLatestBaileysVersion()).version; } catch (e) { version = undefined; }

	const sock = makeWASocket({
		version,
		logger: silentLogger,
		browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, silentLogger) : state.keys,
		},
		markOnlineOnConnect: false,
		syncFullHistory: false,
	});

	return new Promise((resolve) => {
		let finished = false;
		let opened = false;
		let codeShown = false;
		let codeBusy = false;
		let fallbackTimer = null;

		const finish = async (result) => {
			if (finished) return;
			finished = true;
			clearTimeout(fallbackTimer);
			try { await saveCreds(); } catch (e) { /* ignore */ }
			try { sock.ev.removeAllListeners('connection.update'); } catch (e) { /* ignore */ }
			try { sock.end(undefined); } catch (e) { /* ignore */ }
			resolve(result);
		};

		const requestCode = async (quiet) => {
			// never ask for a pairing code on a socket that is already linked / logging in (it would overwrite the login)
			const linked = state.creds && (state.creds.registered || (state.creds.me && String(state.creds.me.id).includes(':')));
			if (!phone || codeShown || codeBusy || finished || opened || linked) return;
			codeBusy = true;
			try {
				const code = await sock.requestPairingCode(phone);
				codeShown = true;
				printCode(code);
			} catch (e) {
				if (!quiet) log('could not get a pairing code:', e.message);
			}
			codeBusy = false;
		};

		sock.ev.on('creds.update', saveCreds);

		sock.ev.on('connection.update', async (update) => {
			const { connection, lastDisconnect, qr } = update;

			if (qr) {
				if (phone) await requestCode(false);
				else printQr(qr);
			}

			if (connection === 'open') {
				opened = true;
				log('WhatsApp linked as', (state.creds && state.creds.me && state.creds.me.id) || '(unknown)');
				await sleep(4000); // let WhatsApp finish sending the first keys / app-state
				try { await saveCreds(); } catch (e) { /* ignore */ }
				await markStored(id, state.creds);
				return finish('paired');
			}

			if (connection === 'close') {
				const status = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
					? lastDisconnect.error.output.statusCode
					: undefined;
				if (status === (DisconnectReason.restartRequired || 515)) return finish('restart'); // normal right after pairing
				if (status === (DisconnectReason.loggedOut || 401)) return finish('reset');
				return finish('retry');
			}
		});

		// some versions do not emit "qr" before we can ask for a code, so try once after a short wait too
		fallbackTimer = setTimeout(() => requestCode(true), 4000);
	});
}

async function pairNewSession(id) {
	const api = await getApi();
	const phone = (process.env.PAIR_NUMBER || '').replace(/\D/g, '');

	log('No saved WhatsApp session found for SESSION_ID "' + id + '" - starting a new login.');
	if (!phone) {
		log('PAIR_NUMBER is not set, so a QR code will be printed.');
		log('Tip: set PAIR_NUMBER=<country code><number> (example 919876543210) to get a pairing code instead of a QR.');
	}

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		let result;
		try {
			result = await runSocket(id, phone, api);
		} catch (e) {
			log('login attempt failed:', e.message);
			result = 'retry';
		}
		if (result === 'paired') {
			log('Login saved to the database. Starting the bot...');
			return true;
		}
		if (result === 'reset') {
			log('WhatsApp rejected the login, starting again with fresh credentials.');
			try { await delsession('creds', id); } catch (e) { /* ignore */ }
		}
		await sleep(result === 'restart' ? 300 : 2500);
	}

	log('Could not link WhatsApp after ' + MAX_ATTEMPTS + ' tries. Check PAIR_NUMBER and start the bot again.');
	process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// entry points used by lib/initMultiAuthState.js
// ---------------------------------------------------------------------------------------------

const inflight = new Map();

async function doEnsureSession(id) {
	if (!id) log('SESSION_ID is empty. Set it to any name (e.g. mybot) and keep it the same on every start.');

	const existing = await getcreds(id);
	if (existing && existing.length > 0) return true;

	// credentials were saved by an earlier login but the Creds row is missing -> just re-create the row
	const stored = await readStoredCreds(id);
	if (stored && (stored.registered || stored.me)) {
		await markStored(id, stored);
		return true;
	}

	const data = (process.env.SESSION_DATA || '').trim();
	if (data && (await importSession(id, data))) return true;

	const api = (process.env.SESSION_API || DEFAULT_SESSION_API || '').trim();
	if (api && id) {
		if (await fetchRemoteSession(id, api)) return true;
		if (!(process.env.PAIR_NUMBER || '').replace(/\D/g, '')) {
			log('Could not get the session for SESSION_ID "' + id + '". Check SESSION_ID (copy it again from the session site) and try again.');
			process.exit(1);
		}
		log('Falling back to a pairing code (PAIR_NUMBER is set).');
	}

	return pairNewSession(id);
}

function ensureSession(id) {
	const key = String(id);
	if (!inflight.has(key)) {
		const p = doEnsureSession(id).finally(() => inflight.delete(key));
		inflight.set(key, p);
	}
	return inflight.get(key);
}

// AUTH_FILE (folder based) mode used to download the folder from the session server as well.
async function ensureSessionFiles(dir, id) {
	if (fs.existsSync(path.join(dir, 'creds')) || fs.existsSync(path.join(dir, 'creds.json'))) return true;
	log('AUTH_FILE mode: no session files found in "' + dir + '" and there is no session server any more.');
	log('Remove the AUTH_FILE variable to use the database session (pairing code / QR) instead.');
	return true;
}

module.exports = { ensureSession, ensureSessionFiles, importSession, pairNewSession };
