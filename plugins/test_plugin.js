const fs = require('fs');
const path = require('path');
const { Function } = require('../lib/');
const config = require('../config');

async function loadTempPlugin(message, code) {
	if (!code) {
		return await message.reply('_Send plugin code after >_\n*Example:* `> const { Function } = require("../lib/"); ...`');
	}

	// താൽക്കാലികമായി ഒരു ഫയൽ ഉണ്ടാക്കി require() ചെയ്ത ഉടനെ ഡിലീറ്റ് ചെയ്യുന്നു.
	// അപ്പോൾ പ്ലഗിൻ RAM-ൽ നിൽക്കുകയും ചെയ്യും, റീസ്റ്റാർട്ട് അടിച്ചാൽ പോവുകയും ചെയ്യും!
	const tempFile = path.join(__dirname, `_temp_${Date.now()}.js`);

	try {
		fs.writeFileSync(tempFile, code, 'utf8');
		
		// പ്ലഗിൻ മെമ്മറിയിലേക്ക് ലോഡ് ചെയ്യുന്നു
		require(tempFile);

		// ഫയൽ അപ്പോൾ തന്നെ ഡിലീറ്റ് ചെയ്യുന്നു (Reboot അടിച്ചാൽ വരാതിരിക്കാൻ)
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}

		// കോഡിൽ നിന്ന് കമാൻഡ് പേര് കണ്ടുപിടിക്കുന്നു (ഉദാഹരണത്തിന് pattern: 'fullpp')
		const patternMatch = code.match(/pattern\s*:\s*['"`]([^'"`]+)['"`]/);
		const cmdName = patternMatch ? patternMatch[1].split(' ')[0] : 'Plugin';

		await message.reply(`✅ *Temporary plugin loaded!*\n*Command:* \`${cmdName}\`\n_Note: This plugin exists only in memory and will vanish on bot restart._`);
	} catch (err) {
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}
		await message.reply('*Plugin Load Error:*\n```' + err.message + '```');
	}
}

// 1. പ്രിഫിക്സ് ഇല്ലാതെ നേരിട്ട് "> <plugin code>" എന്ന് അയച്ചാൽ വർക്ക് ആകാൻ
Function({
	on: 'text',
	fromMe: true
}, async (message, match) => {
	const text = message.text || message.body || '';
	if (!text.startsWith('>')) return;

	const code = text.slice(1).trim();
	await loadTempPlugin(message, code);
});

// 2. ബാക്കപ്പ് കമാൻഡ്: ".tplugin" (കോഡിന് റിപ്ലൈ ആയോ നേരിട്ടോ അടിക്കാൻ)
Function({
	pattern: 'tplugin ?(.*)',
	fromMe: true,
	desc: 'Load temporary plugin into memory until restart',
	type: 'owner'
}, async (message, match) => {
	const code = match || (message.reply_message && message.reply_message.text);
	await loadTempPlugin(message, code);
});
