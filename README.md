# HECAR HACKER – Telegram Approval Demo

This is a small Node.js web app. A visitor presses **REQUEST ACCESS**; the configured Telegram admin receives APPROVE/REJECT buttons. The HECAR interface is shown after approval.

## Files
- `server.js` – Express server and Telegram bot
- `public/index.html` – HECAR interface with animated Matrix background
- `package.json` – dependencies and start command
- `.gitignore` – keeps local secrets out of Git

## Before deploying
1. Create a Telegram bot with `@BotFather`.
2. Start a chat with your bot by sending `/start`.
3. Obtain your own Telegram chat ID using a trusted Telegram bot or your bot's `getUpdates` response.
4. Deploy this repository as a Node Web Service.
5. Set these environment variables in the hosting dashboard:
   - `BOT_TOKEN` = your bot token
   - `ADMIN_CHAT_ID` = your numeric Telegram chat ID
6. Build command: `npm install`
7. Start command: `npm start`

**Never put the bot token in `public/index.html`, GitHub, or a public message.** If a token was exposed, revoke it with BotFather and create a new one.

## Important limitations
- This is a learning/demo project, not production authentication. It uses in-memory sessions; restarting the server clears pending approvals.
- Exit notifications are best-effort. A mobile browser may not notify the server if the user force-stops the browser, loses connectivity, or the operating system kills it.
- The device name is only the browser's user-agent string, not a verified device identity.
- Use only with people who know the app sends an access request and agree to use it. Do not use it to secretly monitor devices.
- For a real public service, add persistent storage, HTTPS, stronger authentication, abuse protection, and proper session management.
