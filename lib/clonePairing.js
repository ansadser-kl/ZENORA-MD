'use strict';
/*
 * Links a NEW WhatsApp number with a pairing code, using the same 'baileys' package the bot already
 * depends on. Used by plugins/pair.js (the .pair command) to give a clone its own login.
 *
 *   const job = startPairing('919876543210', { onCode, onLinked, onFail });
 *
 *   onCode(code)          8-letter pairing code to type in WhatsApp > Linked devices
 *   onLinked(sessionJson) login finished; sessionJson = '{"creds":{...},"pre-key-1":{...},...}'
 *                         (same shape lib/localSession.js's importSession() expects)
 *   onFail(message)       code expired / refused / error
 *   job.stop()            cancel
 *
 * Safe to run several of these at once (one per .pair caller) — nothing is shared between calls.
 * The login lives only in memory here; the caller saves sessionJson (plugins/pair.js does that
 * via lib/localSession.js's importSession()).
 */
const log = (...a) => console.log('[clone-pair]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SETTLE_MS = Number(process.env.CLONE_SETTLE_MS) || 6000;
const MAX_SOCKETS = 6;
const SOCKET_TIMEOUT_MS = 90000;

const silentLogger = {
	level: 'silent',
	trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
	child() { return silentLogger; },
};

let apiPromise = null;
function getApi() {
	if (!apiPromise) {
		apiPromise = import('baileys').then((b) => {
			const pick = (name) => (b[name] !== undefined ? b[name] : b.default && b.default[name]);
			return {
				makeWASocket: typeof b.default === 'function' ? b.default : (b.default && b.default.default) || b.makeWASocket,
				BufferJSON: pick('BufferJSON'),
				initAuthCreds: pick('initAuthCreds'),
				proto: pick('proto'),
				DisconnectReason: pick('DisconnectReason') || {},
				makeCacheableSignalKeyStore: pick('makeCacheableSignalKeyStore'),
				Browsers: pick('Browsers'),
				fetchLatestBaileysVersion: pick('fetchLatestBaileysVersion'),
			};
		});
	}
	return apiPromise;
}

// Auth state that lives only in memory for the duration of the pairing attempt
function memoryAuthState(api) {
	const creds = api.initAuthCreds();
	const store = new Map(); // "pre-key:1" -> value
	const keys = {
		get: async (type, ids) => {
			const out = {};
			for (const id of ids) {
				let value = store.get(type + ':' + id);
				if (type === 'app-state-sync-key' && value && api.proto) {
					value = api.proto.Message.AppStateSyncKeyData.fromObject(value);
				}
				out[id] = value;
			}
			return out;
		},
		set: async (data) => {
			for (const type of Object.keys(data)) {
				for (const id of Object.keys(data[type])) {
					const value = data[type][id];
					if (value) store.set(type + ':' + id, value);
					else store.delete(type + ':' + id);
				}
			}
		},
	};
	const exportAll = () => {
		const map = { creds };
		for (const [k, value] of store) {
			const i = k.indexOf(':');
			map[k.slice(0, i) + '-' + k.slice(i + 1)] = value;
		}
		return JSON.stringify(map, api.BufferJSON.replacer);
	};
	return { creds, keys, exportAll };
}

// a real linked login has a device number in the id ("9198...:12@s.whatsapp.net"); the placeholder
// Baileys writes when a pairing code is requested has none
const isLinked = (creds) => !!(creds && creds.me && String(creds.me.id).includes(':'));

function runSocket(api, state, phone, onCode) {
	return new Promise((resolve) => {
		let done = false, opened = false, codeAsked = false, codeBusy = false;
		const timers = [];
		let sock;

		const finish = async (result) => {
			if (done) return;
			done = true;
			timers.forEach(clearTimeout);
			try { sock.ev.removeAllListeners('connection.update'); } catch (e) { /* ignore */ }
			try { sock.end(undefined); } catch (e) { /* ignore */ }
			resolve(result);
		};

		(async () => {
			let version;
			try { version = (await api.fetchLatestBaileysVersion()).version; } catch (e) { version = undefined; }
			sock = api.makeWASocket({
				version,
				logger: silentLogger,
				browser: api.Browsers ? api.Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
				auth: {
					creds: state.creds,
					keys: api.makeCacheableSignalKeyStore ? api.makeCacheableSignalKeyStore(state.keys, silentLogger) : state.keys,
				},
				markOnlineOnConnect: false,
				syncFullHistory: false,
			});

			sock.ev.on('creds.update', (update) => Object.assign(state.creds, update));

			const requestCode = async (quiet) => {
				if (codeAsked || codeBusy || done || opened || isLinked(state.creds)) return;
				codeBusy = true;
				try {
					const code = await sock.requestPairingCode(phone);
					codeAsked = true;
					onCode(code);
				} catch (e) {
					if (!quiet) { log('could not get a pairing code:', e.message); codeBusy = false; return finish('nocode'); }
				}
				codeBusy = false;
			};

			sock.ev.on('connection.update', async (update) => {
				const { connection, lastDisconnect, qr } = update;
				if (qr) await requestCode(false);

				if (connection === 'open') {
					opened = true;
					if (!isLinked(state.creds)) return finish('retry'); // should not happen
					await sleep(SETTLE_MS);
					return finish('paired');
				}
				if (connection === 'close') {
					const status = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
						? lastDisconnect.error.output.statusCode
						: undefined;
					if (status === (api.DisconnectReason.restartRequired || 515)) return finish('restart'); // normal right after the code is entered
					if (status === (api.DisconnectReason.loggedOut || 401)) return finish('reset');
					return finish('retry');
				}
			});

			timers.push(setTimeout(() => requestCode(true), 4000)); // some versions do not send "qr" first
			timers.push(setTimeout(() => finish('retry'), SOCKET_TIMEOUT_MS));
		})().catch((e) => { log('socket error:', e.message); finish('error'); });
	});
}

function startPairing(phone, hooks) {
	let cancelled = false;
	let codeSent = false;
	const onCode = (code) => { if (!codeSent) { codeSent = true; hooks.onCode(code); } };

	(async () => {
		const api = await getApi();
		const state = memoryAuthState(api);

		for (let i = 1; i <= MAX_SOCKETS && !cancelled; i++) {
			const result = await runSocket(api, state, phone, onCode);
			if (cancelled) return;
			if (result === 'paired') {
				try {
					await hooks.onLinked(state.exportAll());
				} catch (e) {
					log('onLinked failed:', e.message);
					hooks.onFail('Could not save the session. Please try again.');
				}
				return;
			}
			if (result === 'restart') { await sleep(300); continue; }
			if (result === 'nocode') return hooks.onFail('Could not get a pairing code. Check the number and try again.');
			if (result === 'reset') return hooks.onFail('WhatsApp refused the login. Please try again.');
			return hooks.onFail('The code expired or the connection dropped. Please try again.');
		}
		if (!cancelled) hooks.onFail('Could not finish linking. Please try again.');
	})().catch((e) => { log('error:', e.message); hooks.onFail('Something went wrong. Please try again.'); });

	return { stop: () => { cancelled = true; } };
}

module.exports = { startPairing };
