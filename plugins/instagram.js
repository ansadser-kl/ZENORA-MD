const {
    Function,
    isPublic,
    getJson,
    getUrl
} = require('../lib/');

// Both commands use the same API. It returns:
// { status: true, result: [ { title: 'Download Video', url: '...' }, { title: 'Download Thumbnail', url: '...' } ] }
const API = 'https://zellrayy.com/download/instagram/v2?url=';

// The download links are JWT tokens, the file name (with .mp4 / .jpg) is inside the token.
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

// drop the preview pictures that come with every video, keep the real media
function pickMedia(result) {
    const items = result.filter((x) => x && typeof x.url === 'string' && x.url.startsWith('http'));
    const real = items.filter((x) => !isThumbnail(x));
    return real.length ? real : items;
}

async function download(message, link) {
    const data = await getJson(API + encodeURIComponent(link));
    if (!data || !data.status || !Array.isArray(data.result) || data.result.length < 1) {
        return await message.reply('*No media found!*\n_The account may be private or the link is wrong._');
    }
    const media = pickMedia(data.result);
    if (!media.length) return await message.reply('*No media found!*');

    for (const item of media) {
        const type = typeOf(item);
        await message.client.sendMessage(message.jid, { [type]: { url: item.url } }, { quoted: message.data });
    }
}

const textOf = (message, match) => (match || (message.reply_message && message.reply_message.text) || '').trim();

Function({
    pattern: 'insta ?(.*)',
    fromMe: isPublic,
    desc: 'Download Instagram posts, reels and videos',
    type: 'download'
}, async (message, match) => {
    const link = getUrl(textOf(message, match));
    if (!link) return await message.reply('*Need an Instagram link!*\n_Example: .insta https://www.instagram.com/reel/xxxx_');
    try {
        await download(message, Array.isArray(link) ? link[0] : link);
    } catch (error) {
        console.error(error);
        await message.reply('*Failed to download.*\n_Server may be down, please try again later._');
    }
});

Function({
    pattern: 'story ?(.*)',
    fromMe: isPublic,
    desc: 'Download Instagram stories (story link or username)',
    type: 'download'
}, async (message, match) => {
    let input = textOf(message, match);
    if (!input) return await message.reply('*Need a story link or username!*\n_Example: .story https://www.instagram.com/stories/username/123_');

    let link;
    if (/^https?:\/\//i.test(input)) {
        link = getUrl(input);
        link = Array.isArray(link) ? link[0] : link;
    } else {
        // plain username
        const username = input.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '');
        if (!username) return await message.reply('*Provide a valid story link or username.*');
        link = 'https://www.instagram.com/stories/' + username + '/';
    }
    if (!link) return await message.reply('*Provide a valid story link or username.*');

    try {
        await download(message, link);
    } catch (error) {
        console.error(error);
        await message.reply('*Failed to download.*\n_Server may be down, or the story has expired._');
    }
});
