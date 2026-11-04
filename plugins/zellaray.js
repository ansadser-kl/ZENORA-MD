const {
    Function,
    isPublic,
    getJson,
    getUrl
} = require('../lib/');

/*
 * ZellRayy API commands in one file:
 *   .spotify <link | song name>   .terabox <link>   .fb <link>   .ss <website>   .ai <question>
 */
const BASE = 'https://zellrayy.com';

const textOf = (message, match) => (match || (message.reply_message && message.reply_message.text) || '').trim();
const firstUrl = (text) => {
    const link = getUrl(text);
    return Array.isArray(link) ? link[0] : link;
};
const mmss = (total) => {
    total = Math.floor(Number(total));
    return total > 0 ? Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0') : '';
};

/* ------------------------------------------------------------------ .spotify */
// link -> /download/spotify?url=  { result: { title, artist, duration(ms), cover, download } }
// text -> /download/spotiplay?q=  { result: { title, artist, album, duration_str, thumbnail, download, filesize_str } }
const SPOTIFY_LINK = /https?:\/\/(?:open\.spotify\.com|spotify\.link)\/[^\s]+/i;

async function findSong(input) {
    const link = input.match(SPOTIFY_LINK);
    if (link) {
        const data = await getJson(BASE + '/download/spotify?url=' + encodeURIComponent(link[0]));
        const r = data && data.status && data.result;
        if (!r || !r.download) return null;
        return { title: r.title, artist: r.artist, cover: r.cover, download: r.download, duration: mmss(r.duration / 1000) };
    }
    const data = await getJson(BASE + '/download/spotiplay?q=' + encodeURIComponent(input));
    const r = data && data.status && data.result;
    if (!r || !r.download) return null;
    return { title: r.title, artist: r.artist, album: r.album, cover: r.thumbnail, download: r.download, duration: r.duration_str, size: r.filesize_str };
}

Function({
    pattern: 'spotify ?(.*)',
    fromMe: isPublic,
    desc: 'Download a Spotify song (link or song name)',
    type: 'download'
}, async (message, match) => {
    const input = textOf(message, match);
    if (!input) return await message.reply('*Need a Spotify link or a song name!*\n_Example: .spotify Noore Fathima_');

    let song;
    try {
        song = await findSong(input);
    } catch (error) {
        console.error(error);
        return await message.reply('*Failed to get the song.*\n_Server may be down, please try again later._');
    }
    if (!song) return await message.reply('*Song not found!*');

    const lines = [`*${song.title}*`, `Artist : ${song.artist}`];
    if (song.album) lines.push(`Album : ${song.album}`);
    if (song.duration) lines.push(`Duration : ${song.duration}`);
    if (song.size) lines.push(`Size : ${song.size}`);

    if (song.cover) {
        try {
            await message.client.sendMessage(message.jid, { image: { url: song.cover }, caption: lines.join('\n') }, { quoted: message.data });
        } catch (e) {
            await message.reply(lines.join('\n'));
        }
    } else {
        await message.reply(lines.join('\n'));
    }

    try {
        const fileName = String(song.title || 'song').replace(/[\\/:*?"<>|]/g, '') + '.mp3';
        await message.client.sendMessage(message.jid, { audio: { url: song.download }, mimetype: 'audio/mpeg', fileName }, { quoted: message.data });
    } catch (error) {
        console.error(error);
        await message.reply('*Could not send the audio.*\n_Please try again._');
    }
});

/* ------------------------------------------------------------------ .terabox */
// /download/terabox?url=  { result: { list: [ { name, size, size_formatted, type, duration, quality, normal_dlink, is_dir } ] } }
const TERABOX_MAX_FILES = 5;                                          // files sent per link
const TERABOX_MAX_MB = Number(process.env.TERABOX_MAX_MB) || 100;    // bigger files only get a link

Function({
    pattern: 'terabox ?(.*)',
    fromMe: isPublic,
    desc: 'Download files from a Terabox link',
    type: 'download'
}, async (message, match) => {
    const link = firstUrl(textOf(message, match));
    if (!link) return await message.reply('*Need a Terabox link!*\n_Example: .terabox https://1024terabox.com/s/xxxx_');

    let result;
    try {
        const data = await getJson(BASE + '/download/terabox?url=' + encodeURIComponent(link));
        result = data && data.status && data.result;
    } catch (error) {
        console.error(error);
        return await message.reply('*Failed to get the files.*\n_Server may be down, please try again later._');
    }
    const files = result && Array.isArray(result.list)
        ? result.list.filter((f) => f && String(f.is_dir) !== '1' && f.normal_dlink)
        : [];
    if (!files.length) return await message.reply('*No files found!*\n_The link may be wrong or expired._');

    for (const file of files.slice(0, TERABOX_MAX_FILES)) {
        const info = [`*${file.name}*`, `Size : ${file.size_formatted || file.size}`];
        if (file.duration) info.push(`Duration : ${file.duration}`);
        if (file.quality) info.push(`Quality : ${file.quality}`);
        const caption = info.join('\n');

        if (Number(file.size) > TERABOX_MAX_MB * 1024 * 1024) {
            await message.reply(caption + `\n\n_Too big to send here (limit ${TERABOX_MAX_MB} MB). Download link:_\n${file.normal_dlink}`);
            continue;
        }

        let content;
        if (file.type === 'video') content = { video: { url: file.normal_dlink }, caption };
        else if (file.type === 'image') content = { image: { url: file.normal_dlink }, caption };
        else if (file.type === 'audio') content = { audio: { url: file.normal_dlink }, mimetype: 'audio/mpeg', fileName: file.name };
        else content = { document: { url: file.normal_dlink }, mimetype: 'application/octet-stream', fileName: file.name, caption };

        try {
            await message.client.sendMessage(message.jid, content, { quoted: message.data });
        } catch (error) {
            console.error(error);
            await message.reply(caption + `\n\n_Could not send the file. Download link:_\n${file.normal_dlink}`);
        }
    }
    if (files.length > TERABOX_MAX_FILES) {
        await message.reply(`_${files.length - TERABOX_MAX_FILES} more file(s) not sent (limit ${TERABOX_MAX_FILES} per link)._`);
    }
});

/* ------------------------------------------------------------------ .fb */
// /download/facebook?url=  { result: { title, author, duration(s), hd, sd, audio, media: [ { url, type } ] } }
Function({
    pattern: 'fb ?(.*)',
    fromMe: isPublic,
    desc: 'Download Facebook videos (.fb audio <link> for audio only)',
    type: 'download'
}, async (message, match) => {
    let input = textOf(message, match);
    const wantAudio = /^audio\b/i.test(input);
    if (wantAudio) input = input.replace(/^audio\s*/i, '');

    const link = firstUrl(input);
    if (!link) return await message.reply('*Need a Facebook link!*\n_Example: .fb https://www.facebook.com/share/r/xxxx_\n_Audio only: .fb audio <link>_');

    let r;
    try {
        const data = await getJson(BASE + '/download/facebook?url=' + encodeURIComponent(link));
        r = data && data.status && data.result;
    } catch (error) {
        console.error(error);
        return await message.reply('*Failed to download.*\n_Server may be down, please try again later._');
    }
    if (!r) return await message.reply('*No media found!*\n_The video may be private or the link is wrong._');

    const media = Array.isArray(r.media) ? r.media : [];
    const title = String(r.title || '').replace(/\s+/g, ' ').trim();
    const caption = [title.length > 200 ? title.slice(0, 200) + '...' : title, r.author ? `By : ${r.author}` : '', mmss(r.duration) ? `Duration : ${mmss(r.duration)}` : '']
        .filter(Boolean).join('\n');

    try {
        if (wantAudio) {
            const audio = r.audio || (media.find((m) => m.type === 'audio') || {}).url;
            if (!audio) return await message.reply('*No audio found!*');
            return await message.client.sendMessage(message.jid, { audio: { url: audio }, mimetype: 'audio/mp4', fileName: (title.slice(0, 60) || 'audio').replace(/[\\/:*?"<>|]/g, '') + '.m4a' }, { quoted: message.data });
        }

        const firstVideo = (media.find((m) => m.type === 'video') || {}).url;
        const candidates = [r.hd, r.sd, firstVideo].filter((u, i, a) => u && a.indexOf(u) === i);
        if (!candidates.length) return await message.reply('*No video found!*');

        let sent = false;
        for (const url of candidates) {            // HD first, SD if HD fails
            try {
                await message.client.sendMessage(message.jid, { video: { url }, caption }, { quoted: message.data });
                sent = true;
                break;
            } catch (e) {
                console.error('fb send failed:', e.message);
            }
        }
        if (!sent) await message.reply('*Could not send the video.*\n_Please try again._');
    } catch (error) {
        console.error(error);
        await message.reply('*Failed to download.*');
    }
});

/* ------------------------------------------------------------------ .ss */
// /tools/ssweb?url=  { result: { screenshot_url, target_url } }
Function({
    pattern: 'ss ?(.*)',
    fromMe: isPublic,
    desc: 'Take a screenshot of a website',
    type: 'tools'
}, async (message, match) => {
    const raw = textOf(message, match).split(/\s+/)[0];
    let url = '';
    if (/^https?:\/\//i.test(raw)) url = raw;
    else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)) url = 'https://' + raw;   // google.com
    if (!url) return await message.reply('*Need a website link!*\n_Example: .ss https://google.com_');

    let r;
    try {
        const data = await getJson(BASE + '/tools/ssweb?url=' + encodeURIComponent(url));
        r = data && data.status && data.result;
    } catch (error) {
        console.error(error);
        return await message.reply('*Failed to take the screenshot.*\n_Server may be down, please try again later._');
    }
    if (!r || !r.screenshot_url) return await message.reply('*Could not take a screenshot of this site.*');

    try {
        await message.client.sendMessage(message.jid, { image: { url: r.screenshot_url }, caption: r.target_url || url }, { quoted: message.data });
    } catch (error) {
        console.error(error);
        await message.reply('*Could not send the screenshot.*\n' + r.screenshot_url);
    }
});

/* ------------------------------------------------------------------ .ai */
// /ai/claude?q=...&model=...  { result: "answer text" }
const AI_MODEL = process.env.AI_MODEL || 'opus-4-8';
const AI_MAX_QUESTION = 1500;

Function({
    pattern: 'ai ?(.*)',
    fromMe: isPublic,
    desc: 'Ask the AI a question (or reply to a message)',
    type: 'ai'
}, async (message, match) => {
    // "ai ?(.*)" would also match other commands that start with "ai" (like .aitts)
    if (/^\W{0,3}ai[a-z0-9]/i.test(String(message.text || '').trim())) return;

    const typed = (match || '').trim();
    const quoted = (message.reply_message && message.reply_message.text ? message.reply_message.text : '').trim();
    let question = typed && quoted ? typed + '\n\n' + quoted : typed || quoted;
    if (!question) return await message.reply('*Ask me something!*\n_Example: .ai what is the capital of India_');
    question = question.slice(0, AI_MAX_QUESTION);

    try {
        const data = await getJson(BASE + '/ai/claude?q=' + encodeURIComponent(question) + '&model=' + encodeURIComponent(AI_MODEL));
        const answer = data && data.status && typeof data.result === 'string' ? data.result.trim() : '';
        if (!answer) return await message.reply('*No answer received.* _Please try again._');
        await message.reply(answer);
    } catch (error) {
        console.error(error);
        await message.reply('*AI is not responding.*\n_Server may be down, please try again later._');
    }
});
