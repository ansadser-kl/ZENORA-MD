const https = require('https');
const { Function } = require('../lib/');
const config = require('../config');

const LANG_MAP = {
	af: 'af', sq: 'sq', am: 'am', ar: 'ar', hy: 'hy', az: 'az', eu: 'eu', be: 'be', bn: 'bn',
	bs: 'bs', bg: 'bg', ca: 'ca', ceb: 'ceb', zh: 'zh-CN', 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW',
	co: 'co', hr: 'hr', cs: 'cs', da: 'da', nl: 'nl', en: 'en', eo: 'eo', et: 'et', fi: 'fi',
	fr: 'fr', fy: 'fy', gl: 'gl', ka: 'ka', de: 'de', el: 'el', gu: 'gu', ht: 'ht', ha: 'ha',
	haw: 'haw', he: 'iw', iw: 'iw', hi: 'hi', hmn: 'hmn', hu: 'hu', is: 'is', ig: 'ig', id: 'id',
	ga: 'ga', it: 'it', ja: 'ja', jv: 'jw', kn: 'kn', kk: 'kk', km: 'km', rw: 'rw', ko: 'ko',
	ku: 'ku', ky: 'ky', lo: 'lo', la: 'la', lv: 'lv', lt: 'lt', lb: 'lb', mk: 'mk', mg: 'mg',
	ms: 'ms', ml: 'ml', mt: 'mt', mi: 'mi', mr: 'mr', mn: 'mn', my: 'my', ne: 'ne', no: 'no',
	ny: 'ny', or: 'or', ps: 'ps', fa: 'fa', pl: 'pl', pt: 'pt', pa: 'pa', ro: 'ro', ru: 'ru',
	sm: 'sm', gd: 'gd', sr: 'sr', st: 'st', sn: 'sn', sd: 'sd', si: 'si', sk: 'sk', sl: 'sl',
	so: 'so', es: 'es', su: 'su', sw: 'sw', sv: 'sv', tl: 'tl', tg: 'tg', ta: 'ta', tt: 'tt',
	te: 'te', th: 'th', tr: 'tr', tk: 'tk', uk: 'uk', ur: 'ur', ug: 'ug', uz: 'uz', vi: 'vi',
	cy: 'cy', xh: 'xh', yi: 'yi', yo: 'yo', zu: 'zu',
	malayalam: 'ml', english: 'en', hindi: 'hi', tamil: 'ta', telugu: 'te', kannada: 'kn',
	arabic: 'ar', spanish: 'es', french: 'fr', german: 'de', russian: 'ru', japanese: 'ja',
	korean: 'ko', chinese: 'zh-CN', portuguese: 'pt', italian: 'it', urdu: 'ur', bengali: 'bn',
	marathi: 'mr', gujarati: 'gu', turkish: 'tr', indonesian: 'id', thai: 'th', vietnamese: 'vi',
	persian: 'fa', nepali: 'ne', sinhala: 'si', punjabi: 'pa', greek: 'el', dutch: 'nl',
	polish: 'pl', swedish: 'sv', latin: 'la', filipino: 'tl'
};

function resolveLang(input) {
	if (!input) return null;
	const clean = input.toLowerCase().trim();
	return LANG_MAP[clean] || null;
}

// Replied മെസ്സേജിൽ നിന്ന് ടെക്സ്റ്റ് കൃത്യമായി എടുക്കാൻ (എല്ലാ Baileys ഫോർമാറ്റും സപ്പോർട്ട് ചെയ്യും)
function getReplyText(message) {
	const r = message.reply_message || message.quoted;
	if (!r) return '';
	if (typeof r.text === 'string' && r.text) return r.text;
	if (typeof r.body === 'string' && r.body) return r.body;
	if (typeof r.caption === 'string' && r.caption) return r.caption;
	if (r.message) {
		return (
			r.message.conversation ||
			(r.message.extendedTextMessage && r.message.extendedTextMessage.text) ||
			(r.message.imageMessage && r.message.imageMessage.caption) ||
			(r.message.videoMessage && r.message.videoMessage.caption) ||
			''
		);
	}
	return '';
}

function fetchJson(url) {
	return new Promise((resolve, reject) => {
		https.get(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			}
		}, (res) => {
			let raw = '';
			res.on('data', (chunk) => { raw += chunk; });
			res.on('end', () => {
				try {
					resolve(JSON.parse(raw));
				} catch (e) {
					reject(new Error(`Invalid JSON (Status ${res.statusCode})`));
				}
			});
		}).on('error', reject);
	});
}

async function translateText(text, targetLang) {
	// Method 1: Google translate_a/single (GET)
	try {
		const url1 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
		const data = await fetchJson(url1);
		if (Array.isArray(data) && Array.isArray(data[0])) {
			return data[0].map((item) => item[0]).filter(Boolean).join('');
		}
	} catch (_) {}

	// Method 2: Fallback to clients5 dict_chrome_ex endpoint
	const url2 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(text)}`;
	const data2 = await fetchJson(url2);
	if (Array.isArray(data2)) {
		if (typeof data2[0] === 'string') return data2[0];
		if (Array.isArray(data2[0]) && typeof data2[0][0] === 'string') return data2[0][0];
	} else if (data2 && Array.isArray(data2.sentences)) {
		return data2.sentences.map((s) => s.trans || '').join('');
	}

	throw new Error('Could not translate text.');
}

Function({
	pattern: 'trt ?([\\s\\S]*)',
	fromMe: config.MODE === 'private',
	desc: 'Translate text to any language',
	type: 'utility'
}, async (message, match) => {
	// match അല്ലെങ്കിൽ നേരിട്ട് message.text-ൽ നിന്ന് ആർഗ്യുമെന്റ് എടുക്കുന്നു
	let rawInput = (match || '').trim();
	if (!rawInput && (message.text || message.body)) {
		const fullText = (message.text || message.body).trim();
		rawInput = fullText.replace(/^[^\w]*trt\b/i, '').trim();
	}

	const replyText = getReplyText(message).trim();
	let targetLang = 'ml';
	let textToTranslate = '';

	if (replyText) {
		// 1. Reply ആയിട്ട്: .trt ml
		if (rawInput) {
			const firstArg = rawInput.split(/\s+/)[0];
			targetLang = resolveLang(firstArg) || firstArg.toLowerCase();
		}
		textToTranslate = replyText;
	} else if (rawInput) {
		// 2. നേരിട്ട് ടെക്സ്റ്റ്: .trt How are you ml (അവസാനം ലാംഗ്വേജ് കോഡ്)
		const words = rawInput.split(/\s+/);
		if (words.length >= 2) {
			const lastWord = words[words.length - 1];
			const firstWord = words[0];

			if (resolveLang(lastWord)) {
				targetLang = resolveLang(lastWord);
				textToTranslate = words.slice(0, -1).join(' ');
			} else if (resolveLang(firstWord)) {
				targetLang = resolveLang(firstWord);
				textToTranslate = words.slice(1).join(' ');
			} else {
				targetLang = 'ml';
				textToTranslate = rawInput;
			}
		} else {
			targetLang = 'ml';
			textToTranslate = rawInput;
		}
	}

	if (!textToTranslate) {
		return await message.reply(
			'*Google Translate Usage:*\n\n' +
			'1. *Reply to a message:*\n' +
			'   `.trt ml` _(Malayalam)_\n' +
			'   `.trt en` _(English)_\n' +
			'   `.trt hi` _(Hindi)_\n\n' +
			'2. *Text with language at the end:*\n' +
			'   `.trt Hello how are you ml`\n' +
			'   `.trt സുഖമാണോ ബ്രോ en`'
		);
	}

	try {
		const translated = await translateText(textToTranslate, targetLang);
		await message.reply(translated);
	} catch (err) {
		await message.reply('*Translation Error:*\n_' + err.message + '_');
	}
});
