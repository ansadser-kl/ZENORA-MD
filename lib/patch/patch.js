'use strict';
/*
 * The original patch.js was an anti-fork check: when the git "origin" URL was not the author's
 * repository it printed "Invalid remote URL", ran `pm2 delete all` and exited, so the bot refused
 * to start from any copy of the code that lived in a different repo. (Kept as patch.original.js.)
 *
 * This replacement never stops the bot. It only makes sure the folder is a git repository
 * (other parts of the bot call simple-git) and, if you set REPO_URL, points "origin" at YOUR repo
 * so the `.update` command pulls from your repo instead of the author's.
 */
const path = require('path');
const simpleGit = require('simple-git');

let running = null;

async function run() {
	try {
		const git = simpleGit(path.resolve(__dirname, '../..'));
		if (!(await git.checkIsRepo())) {
			try { await git.raw(['init', '-b', 'main']); } catch (e) { await git.init(); }
		}
		const repoUrl = (process.env.REPO_URL || '').trim();
		if (repoUrl) {
			const remotes = await git.getRemotes();
			if (remotes.some((r) => r.name === 'origin')) await git.remote(['set-url', 'origin', repoUrl]);
			else await git.addRemote('origin', repoUrl);
		}
	} catch (e) {
		// git problems must never block the bot from starting
	}
}

// Many modules call patch() at load time; share one run so they don't race each other.
function patch() {
	if (!running) running = run();
	return running;
}

module.exports = { patch };
