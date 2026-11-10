const { Function, isPublic } = require('../lib/');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = 'https://transcript.lol/api/trpc/freeTool';
const PROXY_URL = 'https://youtubescraps.anuansad50.workers.dev';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Origin': 'https://transcript.lol',
  'Referer': 'https://transcript.lol/'
};

Function({
  pattern: 'ytn ?(.*)',
  fromMe: isPublic,
  desc: 'Download YouTube video using transcript.lol & proxy worker',
  type: 'download'
}, async (message, match) => {
  let tempFile = null;
  try {
    const query = (match && match.trim()) || (message.reply_message && message.reply_message.text) || '';
    if (!query) return await message.reply('_Please provide a YouTube URL!_\n*Example: .ytn https://youtu.be/...*');

    const ytMatch = query.match(/(https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/i);
    if (!ytMatch) return await message.reply('_Invalid YouTube URL provided!_');
    const targetUrl = ytMatch[0].trim();

    await message.reply('_Submitting video..._');

    // 1. submit job
    const submitRes = await axios.post(
      `${BASE_URL}.submitClientDownload?batch=1`,
      { '0': { json: { url: targetUrl } } },
      { headers, timeout: 30000 }
    );
    const jobId = submitRes.data?.[0]?.result?.data?.json?.jobId;
    if (!jobId) throw new Error('jobId kittiyilla');

    // 2. poll until done
    let result = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const pollRes = await axios.get(`${BASE_URL}.pollClientDownload?batch=1`, {
        headers,
        params: { input: JSON.stringify({ '0': { json: { jobId } } }) },
        timeout: 30000
      });
      const json = pollRes.data?.[0]?.result?.data?.json;
      if (json?.status === 'success') { result = json.result; break; }
      if (json?.status === 'error' || json?.status === 'failed') throw new Error('Server failed to process the video!');
    }
    if (!result) throw new Error('Timeout: API processing complete aayilla');

    // 3. find direct url
    const raw = result.downloadLinks || result.links || result;
    let directUrl = null;
    if (Array.isArray(raw)) {
      const f = raw[0];
      directUrl = typeof f === 'string' ? f : (f?.url || f?.link || f?.downloadUrl);
    } else if (raw && typeof raw === 'object') {
      directUrl = raw.url || raw.link || Object.values(raw)[0];
    } else if (typeof raw === 'string') {
      directUrl = raw;
    }
    if (!directUrl) throw new Error('Link path shariyalla!');

    // 4. download via proxy to temp file
    await message.reply('_Downloading video from proxy worker..._');
    tempFile = path.join(os.tmpdir(), `yt_${Date.now()}.mp4`);
    const writer = fs.createWriteStream(tempFile);
    const response = await axios({
      method: 'GET',
      url: `${PROXY_URL}/?url=${encodeURIComponent(directUrl)}`,
      responseType: 'stream',
      timeout: 180000
    });
    response.data.pipe(writer);
    await new Promise((res, rej) => {
      writer.on('finish', res);
      writer.on('error', rej);
      response.data.on('error', rej);
    });

    const size = fs.statSync(tempFile).size;
    if (size === 0) throw new Error('Download failed: Empty video file!');
    const sizeMB = (size / (1024 * 1024)).toFixed(2);
    const caption = `_*YouTube Video Downloaded*_\n_Size: ${sizeMB} MB_`;

    // 5. send
    if (size > 100 * 1024 * 1024) {
      await message.reply(`_File size is ${sizeMB} MB (> 100 MB). Sending as document..._`);
      await message.client.sendMessage(
        message.jid,
        { document: { url: tempFile }, mimetype: 'video/mp4', fileName: `YouTube_Video_${Date.now()}.mp4`, caption },
        { quoted: message.data }
      );
    } else {
      await message.client.sendMessage(
        message.jid,
        { video: { url: tempFile }, mimetype: 'video/mp4', caption },
        { quoted: message.data }
      );
    }
  } catch (error) {
    console.error('Error:', error);
    const msg = error.response ? `HTTP ${error.response.status}` : error.message;
    return await message.reply(`Error: ${msg || 'Unknown error occurred'}`);
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch (e) {}
    }
  }
});
