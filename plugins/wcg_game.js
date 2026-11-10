/*
 * Word Chain Game (dynamic difficulty) - ZENORA-MD plugin
 *
 * Commands:
 *   .wcg          create a game (60s to join by typing "join")
 *   .wcg start    start early (needs 2+ players)
 *   .wcgstats     show current game stats
 *   .endwcg       end the game in this chat
 *
 * Game logic: original by @souravkl11 (2025-06-15), GPL-3.0.
 * Word list: dwyl/english-words (words_alpha.txt).
 * Ported to ZENORA-MD: uses Function/isPublic from ../lib, `got` instead of axios,
 * message.reply instead of sendReply, and a few bug fixes (see notes at the bottom).
 */
const { Function, isPublic } = require('../lib/');
const got = require('got');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WORD_LIST_URL = 'https://rawcdn.githack.com/dwyl/english-words/20f5cc9b3f0ccc8ce45d814c532b7c2031bba31c/words_alpha.txt';
const WORD_CACHE = path.join(os.tmpdir(), 'zenora_words_alpha.txt');

const FALLBACK_WORDS = [
  'yes', 'you', 'your', 'year', 'young', 'yellow', 'yard', 'yell', 'yolk', 'yarn',
  'key', 'keep', 'kind', 'know', 'king', 'kick', 'kill', 'kiss', 'knee', 'knife',
  'apple', 'eagle', 'elephant', 'tiger', 'river', 'robot', 'table', 'earth', 'house', 'water'
];

let WORD_SET = null;

const parseWords = (text) =>
  new Set(
    text.split('\n')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3)
  );

// Loads the word list once: disk cache first, then download, then a tiny fallback list.
(async function initWordSet() {
  try {
    if (fs.existsSync(WORD_CACHE)) {
      WORD_SET = parseWords(fs.readFileSync(WORD_CACHE, 'utf8'));
      if (WORD_SET.size > 1000) return console.log(`[wcg] Loaded ${WORD_SET.size} words from cache`);
    }
    const body = await got(WORD_LIST_URL, { timeout: 30000 }).text();
    WORD_SET = parseWords(body);
    try { fs.writeFileSync(WORD_CACHE, body); } catch (e) { /* cache is optional */ }
    console.log(`[wcg] Loaded ${WORD_SET.size} words from URL`);
  } catch (error) {
    console.error('[wcg] Could not load word list, using fallback:', error.message);
    WORD_SET = new Set(FALLBACK_WORDS);
  }
})();

const activeGames = new Map();

function getDynamicDifficulty(totalWords, activePlayerCount = 2) {
  let t = { easy: 8, medium: 20, challenging: 40, hard: 65, expert: 95, master: 130 };

  if (activePlayerCount <= 2) t = { easy: 5, medium: 12, challenging: 24, hard: 40, expert: 60, master: 80 };
  else if (activePlayerCount === 3) t = { easy: 6, medium: 15, challenging: 30, hard: 50, expert: 75, master: 100 };
  else if (activePlayerCount === 4) t = { easy: 7, medium: 17, challenging: 35, hard: 55, expert: 80, master: 110 };

  if (totalWords < t.easy) return { minLength: 3, timeLimit: 40000, level: 'Beginner', thresholds: t };
  if (totalWords < t.medium) return { minLength: 4, timeLimit: 35000, level: 'Easy', thresholds: t };
  if (totalWords < t.challenging) return { minLength: 4, timeLimit: 30000, level: 'Medium', thresholds: t };
  if (totalWords < t.hard) return { minLength: 5, timeLimit: 25000, level: 'Challenging', thresholds: t };
  if (totalWords < t.expert) return { minLength: 5, timeLimit: 20000, level: 'Hard', thresholds: t };
  if (totalWords < t.master) return { minLength: 6, timeLimit: 18000, level: 'Expert', thresholds: t };
  return { minLength: 6, timeLimit: 15000, level: 'Master', thresholds: t };
}

const mentionjid = (jid) => '@' + String(jid).split('@')[0].split(':')[0];

class WordChainGame {
  constructor(jid) {
    this.jid = jid;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.gameState = 'waiting';
    this.currentLetter = this.getRandomLetter();
    this.usedWords = new Set();
    this.totalWords = 0;
    this.longestWord = '';
    this.longestWordPlayerJid = '';
    this.startTime = null;
    this.joinTimer = null;
    this.turnTimer = null;
    this.currentDifficulty = getDynamicDifficulty(0, 2);
    this.processingWord = false;
    this.turnNumber = 0;
  }

  getRandomLetter() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return letters[Math.floor(Math.random() * letters.length)];
  }

  addPlayer(userId, username) {
    if (this.players.find((p) => p.id === userId)) return false;
    this.players.push({ id: userId, username, words: 0, eliminated: false });
    return true;
  }

  getActivePlayers() {
    return this.players.filter((p) => !p.eliminated);
  }

  getCurrentPlayer() {
    const active = this.getActivePlayers();
    if (!active.length) return null;
    return active[this.currentPlayerIndex % active.length];
  }

  getNextPlayer() {
    const active = this.getActivePlayers();
    if (!active.length) return null;
    return active[(this.currentPlayerIndex + 1) % active.length];
  }

  nextTurn() {
    const active = this.getActivePlayers();
    if (!active.length) return;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % active.length;
    this.turnNumber++;
  }

  eliminatePlayer(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.eliminated) return false;

    const activeBefore = this.getActivePlayers();
    const idx = activeBefore.findIndex((p) => p.id === playerId);
    player.eliminated = true;

    const active = this.getActivePlayers();
    if (active.length) {
      if (idx !== -1 && idx <= this.currentPlayerIndex) {
        this.currentPlayerIndex = Math.max(0, this.currentPlayerIndex - 1);
      }
      if (this.currentPlayerIndex >= active.length) this.currentPlayerIndex = 0;
    }
    return true;
  }

  // returns true when the level changed
  updateDifficulty() {
    const oldLevel = this.currentDifficulty.level;
    this.currentDifficulty = getDynamicDifficulty(this.totalWords, this.getActivePlayers().length);
    return oldLevel !== this.currentDifficulty.level;
  }

  isValidWord(word) {
    return !!WORD_SET && WORD_SET.has(word.toLowerCase());
  }

  getGameDuration() {
    if (!this.startTime) return '00:00:00';
    const seconds = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
  }

  getDifficultyEmoji() {
    const map = {
      Beginner: '🟢', Easy: '🟡', Medium: '🟠', Challenging: '🔴',
      Hard: '🟤', Expert: '🟣', Master: '⚫'
    };
    return map[this.currentDifficulty.level] || '🔵';
  }

  getDifficultyProgressInfo() {
    const next = Object.values(this.currentDifficulty.thresholds).find((x) => x > this.totalWords);
    return next === undefined ? 'MAX LEVEL' : `${next - this.totalWords} words to next level`;
  }

  clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    if (this.joinTimer) { clearInterval(this.joinTimer); this.joinTimer = null; }
  }
}

async function react(client, message, emoji) {
  try {
    await client.sendMessage(message.jid, { react: { text: emoji, key: message.data.key } });
  } catch (e) {
    console.error('[wcg] react failed:', e.message);
  }
}

function getGameStatusMessage(game) {
  const active = game.getActivePlayers();

  if (active.length <= 1) {
    const winner = active[0];
    let text = winner ? `${mentionjid(winner.id)} Won 🏆\n` : 'Game Over! No winner 😔\n';
    text += `Words : *${game.totalWords}*\n`;
    text += `Final Level : ${game.getDifficultyEmoji()} *${game.currentDifficulty.level}*\n`;
    if (game.longestWord) {
      text += `Longest word : *${game.longestWord} (${game.longestWord.length})* by ${mentionjid(game.longestWordPlayerJid)} 📚\n`;
    }
    text += `Time : *${game.getGameDuration()}* ⏱️`;
    const mentions = [winner && winner.id, game.longestWordPlayerJid].filter(Boolean);
    return { text, mentions };
  }

  const current = game.getCurrentPlayer();
  const next = game.getNextPlayer();
  if (!current || !next) return { text: '❌ Game error: No valid players found', mentions: [] };

  const text =
    `🎲Turn : ${mentionjid(current.id)}\n` +
    `🙌Next : ${mentionjid(next.id)}\n` +
    `🆎Your word must start with *${game.currentLetter}* and include at least *${game.currentDifficulty.minLength}* letters\n` +
    `${game.getDifficultyEmoji()} Level : *${game.currentDifficulty.level}* (${game.getDifficultyProgressInfo()})\n` +
    `🏆Players remaining : ${active.length}/${game.players.length}\n` +
    `⏳You have *${game.currentDifficulty.timeLimit / 1000}s* to answer\n` +
    `📝Total words : ${game.totalWords}`;

  return { text, mentions: [current.id, next.id] };
}

function startTurnTimer(game, client) {
  if (game.turnTimer) clearTimeout(game.turnTimer);

  const turnNumber = game.turnNumber;
  const player = game.getCurrentPlayer();
  if (!player) return;

  const handleTimeOut = async () => {
    const still = game.getCurrentPlayer();
    if (game.turnNumber !== turnNumber || !still || still.id !== player.id) return;

    await client.sendMessage(game.jid, {
      text: `${mentionjid(player.id)} ran out of time! They're out! 🚫`,
      mentions: [player.id]
    });

    game.eliminatePlayer(player.id);

    if (game.getActivePlayers().length <= 1) {
      await client.sendMessage(game.jid, getGameStatusMessage(game));
      game.clearTimers();
      activeGames.delete(game.jid);
    } else {
      game.nextTurn();
      await client.sendMessage(game.jid, getGameStatusMessage(game));
      startTurnTimer(game, client);
    }
  };

  game.turnTimer = setTimeout(async () => {
    try {
      if (game.turnNumber !== turnNumber) return;
      if (game.processingWord) {
        // a word is being checked right now, look again shortly
        game.turnTimer = setTimeout(() => {
          if (game.turnNumber === turnNumber && !game.processingWord) handleTimeOut().catch(console.error);
        }, 300);
        return;
      }
      await handleTimeOut();
    } catch (e) {
      console.error('[wcg] timer error:', e);
    }
  }, game.currentDifficulty.timeLimit);
}

function beginGame(game, client) {
  game.gameState = 'active';
  game.startTime = Date.now();
  game.turnNumber = 1;
  game.updateDifficulty();
  return client.sendMessage(game.jid, getGameStatusMessage(game)).then(() => startTurnTimer(game, client));
}

/* ------------------------------------------------------------------ .wcg */
Function({
  pattern: 'wcg ?(.*)',
  fromMe: isPublic,
  desc: 'Start Word Chain Game with dynamic difficulty',
  type: 'game'
}, async (message, match, client) => {
  const jid = message.jid;
  const command = String(match || '').trim().split(' ')[0].toLowerCase();

  if (command === 'start') {
    const game = activeGames.get(jid);
    if (!game) return await message.reply('❌ No game to start! Use *.wcg* to create a game first.');
    if (game.gameState !== 'waiting') return await message.reply('❌ Game is already running or finished!');
    if (game.players.length < 2) return await message.reply('❌ Need at least 2 players to start the game!');

    game.clearTimers();
    return await beginGame(game, client);
  }

  if (activeGames.has(jid)) return await message.reply('❌ A game is already active in this chat!');

  const game = new WordChainGame(jid);
  activeGames.set(jid, game);

  await message.reply(
    '🎮 Dynamic Word Chain Game Starting...\n' +
    '👥 Needs 2 or more players 🙋‍♂️🙋‍♀️\n' +
    '⏳ Type *join*, 60 seconds left to join ⏳\n' +
    '🔄 *Difficulty increases automatically as you play!*\n' +
    '🟢 Start: 3+ letters, 40s per turn\n' +
    '⚫ Master: 6+ letters, 15s per turn\n' +
    '⚡ *Fewer players = Faster level progression!*\n' +
    '📊 *2 players: Every 5-12-24... words*\n' +
    '📊 *3 players: Every 6-15-30... words*\n' +
    '📊 *4+ players: Every 8-20-40... words*'
  );

  let countdown = 60;
  game.joinTimer = setInterval(async () => {
    try {
      countdown -= 15;
      if (countdown > 0) {
        let update =
          `🎮 Game starts in ${countdown} seconds ⏳\n` +
          'Type *join* to play 🙋‍♂️🙋‍♀️\n' +
          '🔄 Dynamic difficulty system\n' +
          '⚡ Fewer players = Faster progression';
        if (game.players.length > 0) update += `\n👥 ${game.players.length} players joined.`;
        await client.sendMessage(jid, { text: update });
        return;
      }

      clearInterval(game.joinTimer);
      game.joinTimer = null;

      if (game.players.length >= 2) {
        await beginGame(game, client);
      } else {
        await client.sendMessage(jid, { text: '❌ Not enough players joined! Game cancelled.' });
        activeGames.delete(jid);
      }
    } catch (e) {
      console.error('[wcg] join timer error:', e);
    }
  }, 15000);
});

/* ------------------------------------------------- join + word answers */
Function({
  on: 'text',
  fromMe: false
}, async (message, match, client) => {
  const jid = message.jid;
  const game = activeGames.get(jid);
  if (!game) return;

  const text = String(message.text || '').trim().toLowerCase();
  if (!text) return;

  const userId = message.sender;
  const username =
    (message.data && message.data.pushName) || String(userId || '').split('@')[0] || 'Unknown';

  if (game.gameState === 'waiting') {
    if (text !== 'join') return;
    if (game.addPlayer(userId, username)) {
      await client.sendMessage(jid, { text: `${mentionjid(userId)} Joined 👏`, mentions: [userId] });
    } else {
      await client.sendMessage(jid, { text: `${mentionjid(userId)} You're already in the game!`, mentions: [userId] });
    }
    return;
  }

  if (game.gameState !== 'active') return;

  const current = game.getCurrentPlayer();
  if (!current || current.id !== userId) return;
  if (game.processingWord) return;
  if (!/^[a-z]+$/.test(text)) return;

  game.processingWord = true;
  try {
    const word = text;

    if (word.charAt(0).toUpperCase() !== game.currentLetter) {
      await react(client, message, '❌');
      return await message.reply(`❌ Word must start with *${game.currentLetter}*!`);
    }

    if (word.length < game.currentDifficulty.minLength) {
      await react(client, message, '❌');
      return await message.reply(`❌ Word must be at least *${game.currentDifficulty.minLength}* letters long! (${game.currentDifficulty.level} level)`);
    }

    if (game.usedWords.has(word)) {
      await react(client, message, '🔄');
      return await message.reply(`❌ Word *${word}* has already been used!`);
    }

    if (!WORD_SET) return await message.reply('_Word list is still loading, try again in a few seconds_');

    if (!game.isValidWord(word)) {
      await react(client, message, '❓');
      return await message.reply('_This word is not in my words list_');
    }

    if (game.turnTimer) { clearTimeout(game.turnTimer); game.turnTimer = null; }

    game.usedWords.add(word);
    game.totalWords++;
    current.words++;

    if (word.length > game.longestWord.length) {
      game.longestWord = word;
      game.longestWordPlayerJid = current.id;
      await react(client, message, '🏆');
    } else {
      await react(client, message, '✅');
    }

    const levelChanged = game.updateDifficulty();
    game.currentLetter = word.charAt(word.length - 1).toUpperCase();
    game.nextTurn();

    if (levelChanged) {
      await client.sendMessage(jid, {
        text:
          `🆙 *LEVEL UP!* ${game.getDifficultyEmoji()}\n` +
          `New Level: *${game.currentDifficulty.level}*\n` +
          `Min Length: *${game.currentDifficulty.minLength}* letters\n` +
          `Time Limit: *${game.currentDifficulty.timeLimit / 1000}s* per turn\n` +
          `Progress: ${game.getDifficultyProgressInfo()}`
      });
    }

    await client.sendMessage(jid, getGameStatusMessage(game));
    startTurnTimer(game, client);
  } catch (e) {
    console.error('[wcg] answer error:', e);
  } finally {
    game.processingWord = false;
  }
});

/* ---------------------------------------------------------------- .endwcg */
Function({
  pattern: 'endwcg',
  fromMe: true,
  desc: 'End current Word Chain Game',
  type: 'game'
}, async (message) => {
  const game = activeGames.get(message.jid);
  if (!game) return await message.reply('❌ No active game in this chat!');

  game.clearTimers();
  activeGames.delete(message.jid);
  await message.reply('🛑 Word Chain Game ended by admin!');
});

/* -------------------------------------------------------------- .wcgstats */
Function({
  pattern: 'wcgstats',
  fromMe: isPublic,
  desc: 'Show current Word Chain Game stats',
  type: 'game'
}, async (message) => {
  const game = activeGames.get(message.jid);
  if (!game) return await message.reply('❌ No active game in this chat!');

  let s = '📊 *Word Chain Game Stats*\n\n';
  s += `🎮 State: ${game.gameState}\n`;
  s += `${game.getDifficultyEmoji()} Level: ${game.currentDifficulty.level}\n`;
  s += `📏 Min Length: ${game.currentDifficulty.minLength} letters\n`;
  s += `⏱️ Time Limit: ${game.currentDifficulty.timeLimit / 1000}s\n`;
  s += `👥 Total Players: ${game.players.length}\n`;
  s += `🏆 Active Players: ${game.getActivePlayers().length}\n`;
  s += `📝 Words used: ${game.totalWords}\n`;
  s += `🎯 Progress: ${game.getDifficultyProgressInfo()}\n`;
  if (game.longestWord) s += `📏 Longest word: ${game.longestWord} (${game.longestWord.length})\n`;
  if (game.gameState === 'active') {
    s += `🔤 Current letter: ${game.currentLetter}\n`;
    s += `⏱️ Duration: ${game.getGameDuration()}\n`;
    s += `🎯 Turn: ${game.turnNumber}\n`;
  }
  await message.reply(s);
});

/*
 * Notes on changes from the original:
 *  - Module({...}) -> Function({...}); match is a string here, not an array.
 *  - sendReply -> reply; reactions use message.data.key directly.
 *  - axios is not in ZENORA's package.json, so `got` is used; the word list is cached in the OS temp dir.
 *  - Guard added for the moment before the word list has loaded (WORD_SET was null -> crash).
 *  - Longest-word mention used "@number" text as a JID; now the real JID is stored.
 *  - Timer/answer handlers wrapped in try/catch so one failed send can't crash the bot.
 */
