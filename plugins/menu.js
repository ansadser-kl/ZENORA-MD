const {
	Function,
	isPublic,
	Fancy,
	formatBytes,
	commands
} = require('../lib/');
const {
	BOT_INFO,
	MODE,
	PREFIX,
	VERSION
} = require('../config');
const os = require('os');

// menu picture (jpg/png/gif/mp4 link). Can be overridden with the MENU_IMAGE variable.
const MENU_IMAGE = process.env.MENU_IMAGE || 'https://www.image2url.com/r2/default/files/1793608919704-e2d93e36-c818-46e0-afb9-fb4d0a4e3704.jpg';

const HANDLER = /\[(\W*)\]/.test(PREFIX) ? PREFIX.match(/\[(\W*)\]/)[1][0] : '.';

const getName = (command) => {
	try {
		const match = command.pattern.toString().match(/(\W*)([A-Za-zğüşıiöç0-9 ]*)/);
		return match && match.length >= 3 ? match[2].trim() : String(command.pattern).trim();
	} catch {
		return String(command.pattern).trim();
	}
};

Function({
	pattern: 'menu ?(.*)',
	fromMe: isPublic,
	desc: 'Show the command menu',
	type: 'info'
}, async (message, match) => {
	const query = (match || '').trim().toLowerCase();

	// .menu <command> : details of a single command
	if (query) {
		const command = commands.find((c) => c.pattern !== undefined && getName(c).toLowerCase() === query);
		if (!command) return await message.send(`Command "${query}" not found.`);
		const name = getName(command);
		return await message.send(`*${name.toUpperCase()}*\n\nUsage: ${HANDLER}${name}\nDescription: ${command.desc || 'No description available'}`);
	}

	// group commands by type
	const commandslist = {};
	commands.forEach((command) => {
		if (command.dontAddCommandList === false && command.pattern !== undefined) {
			const type = command.type || 'misc';
			if (!commandslist[type]) commandslist[type] = [];
			commandslist[type].push((HANDLER + getName(command)).trim());
		}
	});

	const info = String(BOT_INFO || '').split(';');
	const user = String(message.pushName || '').replace(/[\r\n]+/gm, '');

	const header = `╭━━━〔 ${info[0]} 〕━━━┈⊷
┃✵╭──────────────
┃✵│ Owner : ${info[1]}
┃✵│ User : ${user}
┃✵│ Plugins : ${commands.length}
┃✵│ Runtime : ${runtime(process.uptime())}
┃✵│ Mode : ${MODE}
┃✵│ Platform : ${os.platform()}
┃✵│ Ram : ${formatBytes(os.totalmem() - os.freemem())} / ${formatBytes(os.totalmem())}
┃✵│ Version : ${VERSION}
┃✵╰──────────────
╰━━━━━━━━━━━━━━━┈⊷`;

	let list = '';
	for (const command in commandslist) {
		list += `╭─────────────┈⊷\n`;
		list += `│ 「 *${await Fancy(command.toUpperCase(), 32)}* 」\n`;
		list += `╰┬────────────┈⊷\n┌┤\n`;
		for (const plugin of commandslist[command]) {
			list += `││◦➛ ${await Fancy(plugin.toLowerCase(), 32)}\n`;
		}
		list += `│╰────────────┈⊷\n`;
		list += `╰─────────────┈⊷\n`;
	}

	// one message: picture with the whole menu as caption
	const type = /\.(mp4|mov)(\?|$)/i.test(MENU_IMAGE) ? 'video' : 'image';
	try {
		await message.client.sendMessage(message.jid, {
			[type]: { url: MENU_IMAGE },
			caption: (header + '\n' + list).trim()
		});
	} catch (e) {
		// picture link dead / blocked -> send everything as plain text
		await message.send((header + '\n' + list).trim());
	}
});

const runtime = function (seconds) {
	seconds = Number(seconds);
	var d = Math.floor(seconds / (3600 * 24));
	var h = Math.floor(seconds % (3600 * 24) / 3600);
	var m = Math.floor(seconds % 3600 / 60);
	var s = Math.floor(seconds % 60);
	var dDisplay = d > 0 ? d + " d " : "";
	var hDisplay = h > 0 ? h + " h " : "";
	var mDisplay = m > 0 ? m + " m " : "";
	var sDisplay = s > 0 ? s + " s" : "";
	return dDisplay + hDisplay + mDisplay + sDisplay;
};

exports.runtime = runtime;
