'use strict';
/*
 * Runs each paired clone as its own child process (full copy of this bot, different SESSION_ID).
 * This re-uses index.js/client.js completely unchanged — a clone IS this bot, just started with a
 * different SESSION_ID env var, so none of the bot's own (obfuscated) connection code is touched.
 */
const path = require('path');
const { fork } = require('child_process');

const log = (...a) => console.log('[clone]', ...a);

const MAX_CLONES = Number(process.env.MAX_CLONES) || 5;
const IS_CLONE = process.env.IS_CLONE === '1';
const ALLOW_NESTED_CLONES = process.env.ALLOW_NESTED_CLONES === 'true';

const active = new Map();  // sessionId -> child process
const stopped = new Set(); // sessionId the owner deliberately stopped (no auto-restart)

function canCloneHere() {
	return !IS_CLONE || ALLOW_NESTED_CLONES;
}

function activeCount() {
	return active.size;
}

function isActive(sessionId) {
	return active.has(sessionId);
}

function startClone(sessionId) {
	if (active.has(sessionId)) return active.get(sessionId);
	stopped.delete(sessionId);

	const entry = path.resolve(__dirname, '..', 'index.js');
	const child = fork(entry, [], {
		cwd: path.resolve(__dirname, '..'),
		env: Object.assign({}, process.env, {
			SESSION_ID: sessionId,
			IS_CLONE: '1',
			PORT: '0',           // avoid port clashes with the main bot's web server
			PAIR_NUMBER: '',     // the clone already has a saved session, no pairing needed
		}),
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	});
	log('started clone', sessionId, 'pid', child.pid);
	child.stdout.on('data', (d) => process.stdout.write('[clone ' + sessionId.slice(0, 14) + '] ' + d));
	child.stderr.on('data', (d) => process.stderr.write('[clone ' + sessionId.slice(0, 14) + '] ' + d));
	child.on('exit', (code) => {
		active.delete(sessionId);
		log('clone', sessionId, 'exited with code', code);
		if (!stopped.has(sessionId)) {
			// crashed or was restarted by a .mode/.setsudo change inside the clone — bring it back
			setTimeout(() => { if (!stopped.has(sessionId)) startClone(sessionId); }, 5000);
		}
	});
	active.set(sessionId, child);
	return child;
}

function stopClone(sessionId) {
	stopped.add(sessionId);
	const child = active.get(sessionId);
	if (child) {
		try { child.kill(); } catch (e) { /* ignore */ }
		active.delete(sessionId);
	}
}

function listClones() {
	return [...active.keys()];
}

module.exports = { startClone, stopClone, listClones, isActive, activeCount, canCloneHere, MAX_CLONES };
