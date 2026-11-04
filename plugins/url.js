const fs = require('fs');
const { Function } = require('../lib/');

const HOST = process.env.FILE_HOST || 'https://file-host-rv00.onrender.com';

const EXT = {
	'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
	'video/mp4': '.mp4', 'video/3gpp': '.3gp', 'video/webm': '.webm',
	'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/ogg; codecs=opus': '.ogg',
	'application/pdf': '.pdf', 'application/zip': '.zip'
};

// Try the different download helpers a bot framework may expose
async function getBuffer(rm) {
	const fns = ['download', 'downloadMediaMessage', 'downloadAndSaveMediaMessage'];
	for (const fn of fns) {
		if (typeof rm[fn] !== 'function') continue;
		const r = await rm[fn]();
		if (Buffer.isBuffer(r)) return r;
		if (typeof r === 'string' && fs.existsSync(r)) return fs.readFileSync(r);
	}
	throw new Error('Could not download the replied media');
}

Function({
	pattern: 'url ?(.*)',
	fromMe: true,
	desc: 'Reply to a media/file to get a public URL',
	type: 'converter'
}, async (message, match) => {
	const rm = message.reply_message || message.quoted;
	if (!rm) {
		return await message.reply('*Reply to an image, video, audio or document!*\n_Example: reply to a photo with *.url*_');
	}

	await message.reply('_Uploading... (first upload can take up to a minute)_');

	try {
		const buffer = await getBuffer(rm);
		if (!buffer || !buffer.length) throw new Error('Empty file');

		const mime = rm.mimetype || (rm.message && rm.message.mimetype) || '';
		const ext = EXT[mime] || (rm.image ? '.jpg' : rm.video ? '.mp4' : rm.audio ? '.mp3' : rm.sticker ? '.webp' : '');
		const name = rm.fileName || ('file' + ext);

		const form = new FormData();
		form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), name);

		const res = await fetch(HOST + '/upload', {
			method: 'POST',
			body: form,
			signal: AbortSignal.timeout(120000)
		});
		if (!res.ok) throw new Error('Server replied ' + res.status);
		const data = await res.json();

		return await message.reply(`*Uploaded!* ✅\n\n${data.url}\n\n_Size: ${(data.size / 1024).toFixed(1)} KB_`);
	} catch (e) {
		return await message.reply('*Upload failed!*\n' + e.message);
	}
});
