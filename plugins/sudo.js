const fs = require('fs');
const path = require('path');
const { Function } = require('../lib/');
const config = require('../config');

// config.js reads ./config.env (with override), so SUDO is stored there
const ENV_FILE = path.resolve('config.env');

function getEnvVar(key) {
	if (!fs.existsSync(ENV_FILE)) return undefined;
	const re = new RegExp('^\\s*' + key + '\\s*[=:]\\s*(.*)$');
	for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
		const m = line.match(re);
		if (m) return m[1].trim().replace(/^["']|["']$/g, '');
	}
	return undefined;
}

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

// current sudo numbers (config.env first, because config.SUDO is only read at start-up); "0" is the default placeholder
function getSudoList() {
	const raw = getEnvVar('SUDO');
	const value = raw !== undefined ? raw : (config.SUDO || '');
	return value.split(',').map((x) => x.trim()).filter((x) => x && x !== '0');
}

// number from: replied message > mention > typed text
function pickNumber(message, match) {
	let jid = '';
	if (message.reply_message && message.reply_message.sender) jid = message.reply_message.sender;
	else if (message.mentionedJid && message.mentionedJid[0]) jid = message.mentionedJid[0];
	if (jid) {
		if (jid.includes('@lid')) return { error: '_Could not read the phone number from this reply/mention._\n_Type the number instead: *.setsudo 919876543210*_' };
		return { number: jid.split('@')[0].split(':')[0].replace(/\D/g, '') };
	}
	return { number: String(match || '').replace(/\D/g, '') };
}

function restartSoon() {
	// pm2 (autorestart) starts the bot again, now reading the new SUDO
	setTimeout(() => process.exit(0), 2000);
}

Function({
	pattern: 'setsudo ?(.*)',
	fromMe: true,
	desc: 'Add a sudo number (reply / mention / number)',
	type: 'user'
}, async (message, match) => {
	const { number, error } = pickNumber(message, match);
	if (error) return await message.reply(error);
	if (!number || number.length < 5 || number.length > 15) {
		return await message.reply('*Need a valid number!*\n_Reply to a user or use:_\n*.setsudo 919876543210*\n_(country code, no +)_');
	}
	const list = getSudoList();
	if (list.includes(number)) return await message.reply(`_*${number}* is already a sudo number_\n\n*SUDO:* ${list.join(', ')}`);
	list.push(number);
	try {
		setEnvVar('SUDO', list.join(','));
	} catch (e) {
		return await message.reply('*Could not write config.env*\n' + e.message);
	}
	await message.reply(`_Added *${number}* as sudo_\n\n*SUDO:* ${list.join(', ')}\n\n_Restarting the bot..._`);
	restartSoon();
});

Function({
	pattern: 'delsudo ?(.*)',
	fromMe: true,
	desc: 'Remove a sudo number (reply / mention / number)',
	type: 'user'
}, async (message, match) => {
	const { number, error } = pickNumber(message, match);
	if (error) return await message.reply(error);
	if (!number) return await message.reply('*Need a number!*\n_Reply to a user or use:_\n*.delsudo 919876543210*');
	const list = getSudoList();
	if (!list.includes(number)) return await message.reply(`_*${number}* is not in the sudo list_\n\n*SUDO:* ${list.join(', ') || 'none'}`);
	const left = list.filter((x) => x !== number);
	try {
		setEnvVar('SUDO', left.join(','));
	} catch (e) {
		return await message.reply('*Could not write config.env*\n' + e.message);
	}
	await message.reply(`_Removed *${number}* from sudo_\n\n*SUDO:* ${left.join(', ') || 'none'}\n\n_Restarting the bot..._`);
	restartSoon();
});

Function({
	pattern: 'getsudo ?(.*)',
	fromMe: true,
	desc: 'Show sudo numbers',
	type: 'user'
}, async (message) => {
	const list = getSudoList();
	return await message.reply('*SUDO numbers:*\n' + (list.length ? list.join('\n') : '_none_'));
});
