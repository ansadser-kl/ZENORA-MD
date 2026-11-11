const {
	Function,
	isPublic,
	sendAlive,
	runtime,
	chatBot,
	isChatBot,
	chatbot
} = require("../lib/");
const config = require('../config');

Function({
	pattern: 'ping ?(.*)',
	fromMe: isPublic,
	desc: 'Bot response in second.',
	type: 'info'
}, async (message, match, client) => {
	const start = new Date().getTime();
	const msg = await message.reply('```Ping!```');
	const end = new Date().getTime();
	const responseTime = end - start;

	await client.sendMessage(message.chat || message.jid, {
		text: `*Pong!*\nLatency: \`${responseTime}ms\``,
		edit: msg.key
	});
});

Function({
	pattern: 'alive ?(.*)',
	fromMe: isPublic,
	desc: 'Does bot work?',
	type: 'info'
}, async (message, match, client) => {
	await sendAlive(client, message, match);
});

Function({
	pattern: 'jid',
	fromMe: isPublic,
	desc: 'to get remoteJid',
	type: 'whatsapp'
}, async (message) => {
	await message.reply(message.mentionedJid[0] ? message.mentionedJid[0] : message.quoted ? message.quoted.sender : message.chat);
});

Function({
	pattern: 'runtime',
	fromMe: isPublic,
	desc: 'get bots runtime',
	type: 'info'
}, async (message, match, client) => {
	await message.send(await runtime(process.uptime()));
});

Function({
	on: 'text',
	fromMe: false
}, async (message, match) => {
	if (!await isChatBot(message)) return;
	if (!message.reply_message) return;
	if (!message.reply_message.data.key.fromMe) return;
	await message.reply(await chatbot(message));
});
