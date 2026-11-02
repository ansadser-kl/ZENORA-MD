const {
    Function,
    Database,
    getJson
} = require('../lib/');

/*
 * Instagram auto downloader.
 *   .autoinsta on       -> auto download in this chat
 *   .autoinsta off      -> stop in this chat
 *   .autoinsta all on   -> auto download in every chat
 *   .autoinsta all off  -> stop everywhere (chats that were switched on keep working)
 *   .autoinsta          -> show status
 * When it is on, any Instagram post / reel / tv / story link sent in the chat is downloaded automatically.
 */
const db = new Database('autoinsta');
const ALL_KEY = '__all__';

const API = 'https://zellrayy.com/download/instagram/v2?url=';
const LINK_RE = /https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv|stories)\/[^\s]+/gi;
const MAX_LINKS = 3;           // links handled per message
const COOLDOWN_MS = 60 * 1000; // same link in the same chat is ignored for 1 minute

const recent = new Map();

function fileNameOf(url) {
    try {
        const token = new URL(url).searchParams.get('token') || '';
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        return String(payload.filename || '').toLowerCase();
    } catch (e) {
        return '';
    }
}

function typeOf(item) {
    const title = String(item.title || '').toLowerCase();
    const name = fileNameOf(item.url);
    if (/\.(mp4|mov|webm|mkv)$/.test(name) || /video/.test(title)) return 'video';
    if (/\.(jpe?g|png|webp)$/.test(name) || /image|photo|thumbnail/.test(title)) return 'image';
    return 'video';
}

const isThumbnail = (item) => /thumbnail/i.test(String(item.title || ''));

function pickMedia(result) {
    const items = result.filter((x) => x && typeof x.url === 'string' && x.url.startsWith('http'));
    const real = items.filter((x) => !isThumbnail(x));
    return real.length ? real : items;
}

async function downloadLink(message, client, link) {
    const data = await getJson(API + encodeURIComponent(link));
    if (!data || !data.status || !Array.isArray(data.result) || data.result.length < 1) return;
    for (const item of pickMedia(data.result)) {
        await client.sendMessage(message.jid, { [typeOf(item)]: { url: item.url } }, { quoted: message.data });
    }
}

Function({
    pattern: 'autoinsta ?(.*)',
    fromMe: true,
    desc: 'Auto download Instagram links sent in chat',
    type: 'download'
}, async (message, match) => {
    const input = (match || '').trim().toLowerCase();
    const chat = message.jid;
    const globalOn = !!(db.get(ALL_KEY) && db.get(ALL_KEY).enabled);
    const chatOn = !!(db.get(chat) && db.get(chat).enabled);

    if (!input) {
        return await message.reply(`*Auto Instagram download*\n\nThis chat : ${chatOn ? 'ON' : 'OFF'}\nAll chats : ${globalOn ? 'ON' : 'OFF'}\n\n_.autoinsta on_ / _.autoinsta off_\n_.autoinsta all on_ / _.autoinsta all off_`);
    }
    if (input === 'on' || input === 'off') {
        db.set(chat, { enabled: input === 'on' });
        return await message.reply(`_Auto Instagram download *${input.toUpperCase()}* for this chat_`);
    }
    if (input === 'all on' || input === 'all off') {
        const on = input === 'all on';
        db.set(ALL_KEY, { enabled: on });
        return await message.reply(`_Auto Instagram download *${on ? 'ON' : 'OFF'}* for all chats_`);
    }
    return await message.reply('*Use:*\n.autoinsta on\n.autoinsta off\n.autoinsta all on\n.autoinsta all off');
});

Function({
    on: 'text',
    fromMe: false
}, async (message, match, client) => {
    try {
        const text = String(message.text || '').trim();
        if (!text) return;
        // let the .insta / .story / .autoinsta commands handle their own messages
        if (/^\W{0,3}(insta|story|autoinsta)\b/i.test(text)) return;

        const all = db.get(ALL_KEY);
        const chat = db.get(message.jid);
        if (!((all && all.enabled) || (chat && chat.enabled))) return;

        const links = [...new Set(text.match(LINK_RE) || [])].slice(0, MAX_LINKS);
        if (!links.length) return;

        const now = Date.now();
        for (const [key, time] of recent) if (now - time > COOLDOWN_MS) recent.delete(key);

        for (const link of links) {
            const key = message.jid + '|' + link;
            if (recent.has(key)) continue;
            recent.set(key, now);
            try {
                await downloadLink(message, client, link);
            } catch (e) {
                console.error('autoinsta:', e.message);
            }
        }
    } catch (e) {
        console.error('autoinsta:', e.message);
    }
});
