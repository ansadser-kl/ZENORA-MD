#### HERMIT MD WHATSAPP BOT
Hermit-md - Simple whatsapp Multi Device whatsapp bot.

***

### SETUP (no session website needed)
The old session site is gone. The bot now logs in by itself with a pairing code (or QR) and
stores the login in your database.

#### Environment variables
| Name | What to put |
|---|---|
| `DATABASE_URL` | Postgres URL (Render > PostgreSQL > Internal Database URL). Empty = local sqlite file |
| `SESSION_ID` | Any name, e.g. `mybot`. Keep it the same on every start |
| `PAIR_NUMBER` | Your WhatsApp number with country code, no `+` (e.g. `919876543210`) |
| `PORT` | `3000` |
| `PREFIX`, `SUDO`, `MODE` | Optional, same as before |
| `REPO_URL` | Optional. Your repo URL so `.update` pulls from your repo |
| `SESSION_DATA` | Optional. Base64 / JSON of an existing Baileys `creds.json` to import instead of pairing |

#### Deploy on Render
1. Upload these files to your own GitHub repo (without `node_modules`).
2. Render > New > PostgreSQL, copy the Internal Database URL.
3. Render > New > Web Service > select your repo, Environment = **Docker**.
4. Add the variables above and deploy.
5. Open **Logs**, copy the `WHATSAPP PAIRING CODE`, then on your phone:
   WhatsApp > Settings > Linked devices > Link a device > *Link with phone number instead* > type the code.
   (The code lasts about a minute; a new one is printed if it expires.)
6. When you see `Login saved to the database. Starting the bot...` the bot is running.
   Later restarts do not need pairing again. If you change `DATABASE_URL` or `SESSION_ID`, you must pair again.

If `PAIR_NUMBER` is empty a QR code is printed in the logs instead.

#### Notes
- `lib/initMultiAuthState.core.js` and `lib/patch/patch.original.js` are the untouched original files.
- `lib/localSession.js` is the new login code. `lib/patch/patch.js` no longer stops the bot when the repo is not the author's.
- `AUTH_FILE` (folder session) mode is not supported any more; use the database session.

---

<!--
### Privacy and Security

- Hermit-MD is an **open-source** bot with **encrypted source code**. We value privacy, and the core functionality is protected from tampering.
- Your session ID, generated via https://hermit-md.vercel.app/session, is **encrypted** with a secret password and stored securely for **24 hours**.  
- The session data is **only accessible by you**. We cannot decrypt it, ensuring full privacy.
- We do **not use Pastebin or any other alternatives** for storing session data. All session data is securely stored in a **PostgreSQL database**, which is fully controlled by us, ensuring your data's security and privacy.
- Once the session is initiated, it is saved on your side in encrypted form, and the bot communicates with the server only for **error reports, updates, and active user counts**.  
- No personal data or decrypted sessions are shared via the WebSocket connection.

---

#### DEPLOY TO RENDER 

1. If You don't have a account in render. Create a account.
    <br>
<a href='https://dashboard.render.com/register' target="_blank"><img alt='render' src='https://img.shields.io/badge/-Create-black?style=for-the-badge&logo=render&logoColor=white'/></a>

3. Get [DATABASE_URL](https://github.com/A-d-i-t-h-y-a-n/hermit-md/wiki/DATABASE_URL) and copy it

4. Get [Render api key](https://dashboard.render.com/u/settings#api-keys)

2. Now Deploy
    <br>
<a href='https://render.com/deploy?repo=https://github.com/A-d-i-t-h-y-a-n/hermit-bot' target="_blank"><img alt='DEPLOY' src='https://img.shields.io/badge/-DEPLOY-black?style=for-the-badge&logo=render&logoColor=white'/></a>

#### DEPLOY TO KOYEB 

1. If You don't have a account in koyeb. Create a account.
    <br>
<a href='https://app.koyeb.com/auth/signup' target="_blank"><img alt='koyeb' src='https://img.shields.io/badge/-Create-black?style=for-the-badge&logo=koyeb&logoColor=white'/></a>

3. Create [DATABASE_URL](https://app.koyeb.com/database-services/new) and copy it

4. Get [Koyeb API_KEY](https://app.koyeb.com/settings/api)

2. Now Deploy
    <br>
<a href='https://hermit-md.vercel.app/koyeb' target="_blank"><img alt='DEPLOY' src='https://img.shields.io/badge/-DEPLOY-black?style=for-the-badge&logo=koyeb&logoColor=white'/></a>

-->

#### RUN ON VPS/UBUNTU/WINDOWS

1. Install NodeJs,ffmpeg
2. Installation
   ```
   npm i -global pm2
   git clone https://github.com/A-d-i-t-h-y-a-n/hermit-bot.git
   cd hermit-bot
   npm install
   ```
3. Configuration
   ```
   echo "VPS = true
     SESSION_ID = null
     AUTH_FILE = session
     SUDO = null
     PREFIX = .
     MODE = private
     LOG_MSG = true" > config.env
   ```
- Start
  ```
  npm start
  ```
- Stop
  ```
  pm2 delete hermit-md
  ```
<br>

For help visit [Github wiki](https://github.com/A-d-i-t-h-y-a-n/hermit-bot/wiki)

***

[![Join us on Telegram](https://img.shields.io/badge/Join_Telegram-blue?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/hermitmd_official)

<a href="https://whatsapp.com/channel/0029Va4OxFAGk1FjrFvTJa1V"><img alt="WhatsApp" src="https://img.shields.io/badge/-Whatsapp%20Channel-white?style=for-the-badge&logo=whatsapp&logoColor=black"/></a>
