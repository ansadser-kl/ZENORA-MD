const {
  Function,
  addAudioMetaData,
  isUrl,
  getBuffer,
  isPublic,
  getJson,
  toAudio
} = require('../lib/');
const yts = require('yt-search');
const config = require('../config');

// ---------- APIs (change here if an API changes) ----------
const API = {
  audioSearch: q => `https://zellrayy.com/download/ytplaymusic?q=${encodeURIComponent(q)}`,
  audioUrl: u => `https://zellrayy.com/download/ytmp3?url=${encodeURIComponent(u)}`,
  videoUrl: u => `https://www.neoapis.xyz/api/downloader/ytdl?url=${encodeURIComponent(u)}&type=Mp4`,
  ytv: (u, q) => `https://api.starlights.uk/api/download/ytmp4v3?url=${encodeURIComponent(u)}&quality=${q}`
};

const isYt = text => isUrl(text) && /youtu/i.test(text);
const getText = (message, match) =>
  (match && match.trim()) || (message.reply_message && message.reply_message.text) || '';

// text / youtube url -> audio info { title, thumbnail, download }
async function resolveAudio(input) {
  if (isYt(input)) {
    const res = await getJson(API.audioUrl(input));
    if (res && res.status && res.result && res.result.download) return res.result;
    throw new Error('Audio API failed');
  }
  // song name: try the search API first
  try {
    const res = await getJson(API.audioSearch(input));
    if (res && res.status && res.result && res.result.download) return res.result;
  } catch (e) {
    console.error('audioSearch failed:', e.message);
  }
  // fallback: yt-search -> url API
  const search = await yts(input);
  if (!search.videos.length) throw new Error('No results found');
  const res = await getJson(API.audioUrl(search.videos[0].url));
  if (res && res.status && res.result && res.result.download) return res.result;
  throw new Error('Audio API failed');
}

// text / youtube url -> youtube url
async function toYtUrl(input) {
  if (isYt(input)) return input;
  const search = await yts(input);
  if (!search.videos.length) throw new Error('No results found');
  return search.videos[0].url;
}

// .video -> { title, download }
async function resolveVideo(input) {
  const url = await toYtUrl(input);
  const res = await getJson(API.videoUrl(url));
  if (res && res.status && res.data && res.data.download) return res.data;
  throw new Error('Video API failed');
}

// .ytv -> { title, download } with quality (e.g. 360p, 720p)
async function resolveYtv(input, quality) {
  const url = await toYtUrl(input);
  const res = await getJson(API.ytv(url, quality));
  if (res && res.status && res.url) return { title: res.title, download: res.url };
  throw new Error('Video API failed (try another quality)');
}

async function sendAudio(message, info) {
  const audioBuffer = await getBuffer(info.download);
  let out;
  try {
    const thumb = await getBuffer(info.thumbnail);
    out = await addAudioMetaData(
      await toAudio(audioBuffer),
      thumb,
      info.title,
      `${config.BOT_INFO.split(';')[0]}`,
      'Hermit Official'
    );
  } catch (e) {
    console.error('metadata failed, sending raw audio:', e.message);
    out = audioBuffer;
  }
  await message.client.sendMessage(
    message.jid,
    { audio: out, mimetype: 'audio/mpeg' },
    { quoted: message.data }
  );
}

// ---------- audio commands: .play .song .yta ----------
for (const cmd of ['play', 'song', 'yta']) {
  Function({
    pattern: `${cmd} ?(.*)`,
    fromMe: isPublic,
    desc: 'Download audio from YouTube (name or url)',
    type: 'download'
  }, async (message, match) => {
    const input = getText(message, match);
    if (!input) return await message.reply(`_Need URL or song name!_\n*Example: .${cmd} URL/song name*`);
    try {
      await message.reply('_Downloading audio..._');
      const info = await resolveAudio(input);
      await sendAudio(message, info);
    } catch (error) {
      console.error('Error:', error);
      return await message.reply(`Error: ${error.message || 'Unknown error occurred'}`);
    }
  });
}

// ---------- .video ----------
Function({
  pattern: 'video ?(.*)',
  fromMe: isPublic,
  desc: 'Download video from YouTube (name or url)',
  type: 'download'
}, async (message, match) => {
  const input = getText(message, match);
  if (!input) return await message.reply('_Need URL or video name!_\n*Example: .video URL/video name*');
  try {
    await message.reply('_Downloading video..._');
    const info = await resolveVideo(input);
    await message.send(info.download, 'video', {
      quoted: message.data,
      caption: info.title
    });
  } catch (error) {
    console.error('Error:', error);
    return await message.reply(`Error: ${error.message || 'Unknown error occurred'}`);
  }
});

// ---------- .ytv (quality option: .ytv URL/name format:360) ----------
Function({
  pattern: 'ytv ?(.*)',
  fromMe: isPublic,
  desc: 'Download YouTube video with quality (format:360/480/720/1080)',
  type: 'download'
}, async (message, match) => {
  let input = getText(message, match);
  if (!input) return await message.reply('_Need URL or video name!_\n*Example: .ytv URL/video name format:720*');
  let quality = '720p';
  if (input.includes('format:')) {
    const parts = input.split('format:');
    input = parts[0].trim();
    const q = (parts[1] || '').replace(/\D/g, '');
    if (q) quality = `${q}p`;
  }
  if (!input) return await message.reply('_Need URL or video name!_');
  try {
    await message.reply(`_Downloading video (${quality})..._`);
    const info = await resolveYtv(input, quality);
    await message.send(info.download, 'video', {
      quoted: message.data,
      caption: info.title
    });
  } catch (error) {
    console.error('Error:', error);
    return await message.reply(`Error: ${error.message || 'Unknown error occurred'}`);
  }
});
