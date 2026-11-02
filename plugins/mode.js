const fs = require('fs');
const path = require('path');
const { Function } = require('../lib/');
const config = require('../config');

// config.js reads ./config.env (with override), so this is the file we edit
const ENV_FILE = path.resolve('config.env');

function setEnvVar(key, value) {
	const text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
	const lines = text.split(/\r?\n/);
	const re = new RegExp('^\\s*' + key + '\\s*[=:]');
	let found = false;
	const out = lines.map((line) => {
		if (re.test(line)) {
			found = true;
			return key + '=' + value;
		}
		return line;
	});
	if (!found) {
		if (out.length && out[out.length - 1] === '') out.pop();
		out.push(key + '=' + value);
	}
	fs.writeFileSync(ENV_FILE, out.join('\n').replace(/\n*$/, '\n'), 'utf8');
}

Function({
	pattern: 'mode ?(.*)',
	fromMe: true,
	desc: 'Change bot mode (private / public)',
	type: 'config'
}, async (message, match) => {
	const current = config.MODE;
	const wanted = (match || '').trim().toLowerCase();

	if (!wanted) {
		return await message.reply(`*Current mode:* ${current}\n\n_Change it with:_\n*.mode private*\n*.mode public*`);
	}
	if (wanted !== 'private' && wanted !== 'public') {
		return await message.reply('*Invalid mode!*\n_Use *.mode private* or *.mode public*_');
	}
	if (wanted === current) {
		return await message.reply(`_Mode is already *${current}*_`);
	}

	try {
		setEnvVar('MODE', wanted);
	} catch (e) {
		return await message.reply('*Could not write config.env*\n' + e.message);
	}

	await message.reply(`_Mode changed to *${wanted}*_\n_Restarting the bot..._`);
	// pm2 (autorestart) starts the bot again, now reading the new MODE
	setTimeout(() => process.exit(0), 2000);
});
