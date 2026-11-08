const {
	Function,
	isPublic,
	Database
} = require('../lib/');
const { startPairing } = require('../lib/clonePairing');
const { importSession } = require('../lib/localSession');
const cloneManager = require('../lib/cloneManager');

/*
 * .pair      -> links the SENDER's own WhatsApp number and starts a clone of this bot for them,
 *               hosted right here (no deploy needed on their side).
 * .clones    -> (owner only) list currently running clones
 * .unclone   -> stops the caller's own clone. Owner can also run ".unclone all" to stop every clone.
 *
 * Clones run as separate child processes of this same bot (lib/cloneManager.js), each with its own
 * SESSION_ID, so every clone has the exact same commands/plugins as this bot.
 */
const CLONE_ID_PREFIX = process.env.CLONE_ID_PREFIX || 'CLONE~';
const COOLDOWN_MS = Number(process.env.CLONE_COOLDOWN_MS) || 60000;

const registry = new Database('clones'); // ownerJid -> { sessionId, number, startedAt }
const lastTry = new Map();               // ownerJid -> timestamp, simple per-sender rate limit
const inProgress = new Set();            // ownerJid currently going through .pair

const ownerKey = (jid) => String(jid || '').split(':')[0];
const numberOf = (jid) => ownerKey(jid).split('@')[0].replace(/\D/g, '');

// .pair                -> the sender's own number
// .pair <number>        -> that number (country code, with or without +)
// .pair (as a reply)    -> the number of the replied-to message's sender
function pickTarget(message, match) {
	const typed = String(match || '').replace(/\D/g, '');
	if (typed.length >= 7) return typed;
	if (message.reply_message && message.reply_message.sender) return numberOf(message.reply_message.sender);
	return numberOf(message.sender);
}

function restoreClonesOnBoot() {
	if (!cloneManager.canCloneHere()) return; // a clone does not resurrect its own sub-clones
	try {
		for (const owner of registry.getAllKeys()) {
			const entry = registry.get(owner);
			if (entry && entry.sessionId) cloneManager.startClone(entry.sessionId);
		}
	} catch (e) {
		console.error('[pair] could not restore clones:', e.message);
	}
}
restoreClonesOnBoot();

Function({
	pattern: 'pair ?(.*)',
	fromMe: isPublic,
	desc: 'Get a clone of this bot (links a WhatsApp number with a pairing code). ".pair", ".pair <number>", or reply to someone with ".pair"',
	type: 'tools'
}, async (message, match) => {
	if (!cloneManager.canCloneHere()) {
		return await message.reply('*Cloning is disabled here.*\n_This bot is itself a clone._');
	}

	const owner = ownerKey(message.sender);
	const number = pickTarget(message, match);
	if (!owner || number.length < 7) return await message.reply('*Could not read a valid number.*\n_Use *.pair 919876543210*, reply to someone with *.pair*, or just send *.pair* for your own number._');

	const existing = registry.get(owner);
	if (existing && cloneManager.isActive(existing.sessionId)) {
		return await message.reply('_You already have a clone running._\n_Use *.unclone* to stop it first._');
	}
	if (inProgress.has(owner)) return await message.reply('_Already working on your pairing code, please wait..._');

	const last = lastTry.get(owner) || 0;
	if (Date.now() - last < COOLDOWN_MS) {
		return await message.reply(`_Please wait a bit before trying again._`);
	}
	lastTry.set(owner, Date.now());

	if (cloneManager.activeCount() >= cloneManager.MAX_CLONES) {
		return await message.reply('*This bot already has the maximum number of clones running.*\n_Please try again later._');
	}

	inProgress.add(owner);
	let codeSent = false;

	startPairing(number, {
		async onCode(code) {
			codeSent = true;
			const pretty = String(code).match(/.{1,4}/g).join('-');
			await message.reply(
				`*Your pairing code:* ${pretty}\n\n` +
				`1. Open *WhatsApp* on your phone\n` +
				`2. *Settings > Linked devices > Link a device*\n` +
				`3. Tap *Link with phone number instead*\n` +
				`4. Type the code above\n\n` +
				`_This code lasts about a minute. Your clone starts automatically once you link._`
			);
		},
		async onLinked(sessionJson) {
			const sessionId = CLONE_ID_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
			await importSession(sessionId, sessionJson);
			registry.set(owner, { sessionId, number, startedAt: Date.now() });
			cloneManager.startClone(sessionId);
			inProgress.delete(owner);
			await message.reply(
				`✅ *Clone connected!*\n\n` +
				`Your WhatsApp is now running its own copy of this bot, with all the same commands.\n` +
				`SESSION_ID: ${sessionId}\n\n` +
				`_Send *.unclone* any time to stop it._`
			);
		},
		async onFail(reason) {
			inProgress.delete(owner);
			if (!codeSent) await message.reply('*Could not start pairing.*\n' + reason);
			else await message.reply('*Pairing failed.*\n' + reason + '\n_Send *.pair* to try again._');
		},
	});
});

Function({
	pattern: 'clones',
	fromMe: true,
	desc: 'List currently running clones',
	type: 'tools'
}, async (message) => {
	const owners = registry.getAllKeys();
	if (!owners.length) return await message.reply('_No clones yet._');
	const lines = owners.map((owner) => {
		const e = registry.get(owner) || {};
		const running = e.sessionId && cloneManager.isActive(e.sessionId);
		return `${running ? '🟢' : '🔴'} ${e.number || owner.split('@')[0]}${running ? '' : ' (stopped)'}`;
	});
	await message.reply(`*Clones (${cloneManager.activeCount()} running):*\n\n` + lines.join('\n'));
});

Function({
	pattern: 'unclone ?(.*)',
	fromMe: isPublic,
	desc: 'Stop your clone (owner: ".unclone all" stops every clone)',
	type: 'tools'
}, async (message, match) => {
	const arg = (match || '').trim().toLowerCase();

	if (arg === 'all') {
		// the Function handler only runs fromMe-gated calls when allowed, but "all" must stay owner-only
		if (!message.fromMe) return await message.reply('*Only the bot owner can stop every clone.*');
		for (const owner of registry.getAllKeys()) {
			const e = registry.get(owner);
			if (e && e.sessionId) cloneManager.stopClone(e.sessionId);
			registry.delete(owner);
		}
		return await message.reply('_Stopped every clone._');
	}

	const owner = ownerKey(message.sender);
	const entry = registry.get(owner);
	if (!entry) return await message.reply('_You do not have a clone running._');
	cloneManager.stopClone(entry.sessionId);
	registry.delete(owner);
	await message.reply('_Your clone has been stopped._');
});
