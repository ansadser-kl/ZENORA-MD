#### HERMIT MD WHATSAPP BOT
Hermit-md - Simple whatsapp Multi Device whatsapp bot.

***

### SETUP

#### Environment variables
| Name | What to put |
|---|---|
| `DATABASE_URL` | Postgres URL (Render > PostgreSQL > Internal Database URL). Empty = local sqlite file |
| `SESSION_ID` | The SESSION_ID you get from the session site (click the button, link WhatsApp, copy it). Keep it the same on every start |
| `SESSION_API` | Optional. Already points at the session site by default, only set this to use a different site |
| `PAIR_NUMBER` | Optional. Only needed if you are NOT using a session site: your WhatsApp number with country code, no `+` (e.g. `919876543210`) |
| `PORT` | `3000` |
| `PREFIX`, `SUDO`, `MODE` | Optional, same as before |
| `REPO_URL` | Optional. Your repo URL so `.update` pulls from your repo |
| `SESSION_DATA` | Optional. Base64 / JSON of an existing Baileys `creds.json` to import instead of pairing |
| `AI_MODEL` | Optional. Model used by `.ai` (default `opus-4-8`) |
| `TERABOX_MAX_MB` | Optional. Files bigger than this only get a download link instead of being sent (default `100`) |

#### Getting a SESSION_ID
Open the session site, type your WhatsApp number, press the button to get a pairing code, link it in
WhatsApp (*Settings > Linked devices > Link a device > Link with phone number instead*), then copy the
SESSION_ID the site shows you. Put just that in `SESSION_ID` and start the bot.

If you don't use a session site, leave `SESSION_ID` as any name (e.g. `mybot`) and set `PAIR_NUMBER`
instead — the bot will print its own pairing code (or a QR code if `PAIR_NUMBER` is empty) in the logs.

#### Deploy on Render
1. Upload these files to your own GitHub repo (without `node_modules`).
2. Render > New > PostgreSQL, copy the Internal Database URL.
3. Render > New > Web Service > select your repo, Environment = **Docker**.
4. Add the variables above (`DATABASE_URL` and `SESSION_ID` at least) and deploy.
5. Open **Logs**.
   - With `SESSION_ID` from the session site: wait for `Session downloaded ... and saved to the database.`
   - With `PAIR_NUMBER` instead: copy the `WHATSAPP PAIRING CODE` shown and enter it in WhatsApp.
6. When you see `Login saved to the database. Starting the bot...` (or the session download message) the
   bot is running. Later restarts do not need pairing again. If you change `DATABASE_URL` or `SESSION_ID`,
   you must link again.

#### Notes
- `lib/initMultiAuthState.core.js` and `lib/patch/patch.original.js` are the untouched original files.
- `lib/localSession.js` is the login code (session site + pairing code / QR / `SESSION_DATA` import).
  `lib/patch/patch.js` no longer stops the bot when the repo is not the author's.
- `AUTH_FILE` (folder session) mode is not supported any more; use the database session.

---

### Commands added in this fork

#### Bot management
| Command | What it does |
|---|---|
| `.mode` | Show the current mode |
| `.mode private` / `.mode public` | Change mode (`config.env`) and restart |
| `.setsudo <number>` | Add a sudo number (reply / mention / typed number) |
| `.delsudo <number>` | Remove a sudo number |
| `.getsudo` | List sudo numbers |

#### Downloads (zellrayy.js)
| Command | What it does |
|---|---|
| `.insta <link>` | Download an Instagram post / reel / video |
| `.story <link or username>` | Download an Instagram story |
| `.autoinsta on` / `off` / `all on` / `all off` | Auto-download Instagram links posted in chat |
| `.spotify <link or song name>` | Download a Spotify track |
| `.terabox <link>` | Download files from a Terabox link |
| `.fb <link>` / `.fb audio <link>` | Download a Facebook video (or just its audio) |
| `.ss <website>` | Screenshot a website |
| `.ai <question>` | Ask the AI a question (or reply to a message) |

#### Menu
| Command | What it does |
|---|---|
| `.menu` | Picture + bot info + full command list |
| `.menu <command>` | Details for one command |

---

#### RUN ON VPS/UBUNTU/WINDOWS

1. Install NodeJs,ffmpeg
2. Installation
   ```
   npm i -global pm2
   git clone <your repo URL>
   cd hermit-md
   npm install
   ```
3. Configuration
   ```
   echo "SESSION_ID=
   DATABASE_URL=
   PREFIX=.
   MODE=private" > config.env
   ```
   Fill in `SESSION_ID` (from the session site, or any name if using `PAIR_NUMBER`) and `DATABASE_URL`.
- Start
  ```
  npm start
  ```
- Stop
  ```
  pm2 delete hermit-md
  ```
<br>

***

[![Join us on Telegram](https://img.shields.io/badge/Join_Telegram-blue?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/hermitmd_official)

<a href="https://whatsapp.com/channel/0029Va4OxFAGk1FjrFvTJa1V"><img alt="WhatsApp" src="https://img.shields.io/badge/-Whatsapp%20Channel-white?style=for-the-badge&logo=whatsapp&logoColor=black"/></a>
