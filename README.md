#### ZENORA-MD WHATSAPP BOT
Hermit-md - Simple whatsapp Multi Device whatsapp bot.

***

### SETUP
1. [![Fork](https://img.shields.io/github/forks/ansadser-kl/hermit-md?style=social)](https://github.com/ansadser-kl/hermit-md/fork)
2. Get a SESSION_ID
    <br>
<a href='https://pair-site-ps6x.onrender.com/' target="_blank"><img alt='SESSION' src='https://img.shields.io/badge/SESSION-100000?style=for-the-badge&logo=scan&logoColor=white&labelColor=black&color=black'/></a>

---

#### Environment variables
| Name | What to put |
|---|---|
| `DATABASE_URL` | Postgres URL (Render > PostgreSQL > Internal Database URL). Empty = local sqlite file |
| `SESSION_ID` | The SESSION_ID from the button above |
| `PORT` | `3000` |
| `PREFIX`, `SUDO`, `MODE` | Optional |
| `REPO_URL` | Optional. Your repo URL so `.update` pulls from your repo |

`SESSION_API` already points at the session site, no need to set it unless you use a different one.
No `PAIR_NUMBER` needed when `SESSION_ID` comes from the button above; set it instead if you'd rather
pair directly from the bot's own logs (QR if `PAIR_NUMBER` is empty).

---

### Commands added in this fork

#### Bot management
| Command | What it does |
|---|---|
| `.mode` | Show the current mode |
| `.mode private` / `.mode public` | Change mode and restart |
| `.setsudo <number>` | Add a sudo number (reply / mention / typed number) |
| `.delsudo <number>` | Remove a sudo number |
| `.getsudo` | List sudo numbers |

#### Downloads
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
   git clone https://github.com/ansadser-kl/hermit-md.git
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
- Start
  ```
  npm start
  ```
- Stop
  ```
  pm2 delete hermit-md
  ```
<br>
