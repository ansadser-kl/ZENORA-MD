'use strict';
/*
 * Session handling.
 *
 * The original file (now lib/initMultiAuthState.core.js, untouched) downloaded the WhatsApp session
 * from https://hermit.koyeb.app/authentication?id=<SESSION_ID>. That server is gone, so the bot
 * stopped with "INVALID SESSION ID, SCAN AGAIN!!".
 *
 * Here loadSession()/loadSessionFile() are replaced (see lib/localSession.js). Nothing is fetched from
 * the internet: the session already stored in your database is used, or SESSION_DATA is imported,
 * or a new login is created with a pairing code (PAIR_NUMBER) / QR.
 * initMultiAuthState() (the database-backed Baileys auth state) is still the original one.
 */
const core = require('./initMultiAuthState.core');
const { ensureSession, ensureSessionFiles } = require('./localSession');

exports.initMultiAuthState = core.initMultiAuthState;
exports.loadSession = ensureSession;
exports.loadSessionFile = ensureSessionFiles;
