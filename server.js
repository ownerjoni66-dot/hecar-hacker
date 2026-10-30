
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TOKEN = process.env.BOT_TOKEN;
const ADMIN = process.env.ADMIN_CHAT_ID;

if (!TOKEN || !ADMIN) {
  console.error("BOT_TOKEN or ADMIN_CHAT_ID missing");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
  polling: true
});

const sessions = new Map();

// HOME PAGE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// LOGIN REQUEST
app.post("/api/request", async (req, res) => {

  const id = crypto.randomBytes(32).toString("hex");

  const device = String(
    req.body.device || "Unknown"
  ).slice(0, 100);

  sessions.set(id, {
    status: "pending",
    device: device,
    time: Date.now()
  });

  try {

    await bot.sendMessage(
      ADMIN,
      "🔐 HECAR LOGIN REQUEST\n\nDevice: " + device,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: "✅ APPROVE",
              callback_data: "approve:" + id
            },
            {
              text: "❌ REJECT",
              callback_data: "reject:" + id
            }
          ]]
        }
      }
    );

    res.json({ id: id });

  } catch (error) {

    console.error(
      "TELEGRAM ERROR:",
      error.response?.body || error.message
    );

    sessions.delete(id);

    res.status(500).json({
      error: "Telegram message failed"
    });

}

// APPROVE / REJECT
bot.on("callback_query", async (query) => {

  if (String(query.message.chat.id) !== String(ADMIN)) {
    return bot.answerCallbackQuery(query.id, {
      text: "Not authorized"
    });
  }

  const [action, id] = query.data.split(":");

  const session = sessions.get(id);

  if (!session || session.status !== "pending") {
    return bot.answerCallbackQuery(query.id, {
      text: "Request expired"
    });
  }

  if (action !== "approve" && action !== "reject") return;

  session.status =
    action === "approve" ? "approved" : "rejected";

  await bot.answerCallbackQuery(query.id, {
    text: session.status
  });

  await bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    {
      chat_id: ADMIN,
      message_id: query.message.message_id
    }
  );

  await bot.sendMessage(
    ADMIN,
    "HECAR STATUS: " + session.status.toUpperCase()
  );

});

// CHECK STATUS
app.get("/api/status/:id", (req, res) => {

  const session = sessions.get(req.params.id);

  if (!session || Date.now() - session.time > 900000) {
    sessions.delete(req.params.id);

    return res.status(404).json({
      status: "expired"
    });
  }

  res.json({
    status: session.status
  });

});

// EXIT NOTICE
app.post("/api/exit", async (req, res) => {

  const id = String(req.body.id || "");

  const session = sessions.get(id);

  if (session && session.status === "approved") {

    sessions.delete(id);

    await bot.sendMessage(
      ADMIN,
      "🚪 HECAR EXIT NOTICE\nDevice: " + session.device
    );

  }

  res.json({ ok: true });

});

// REMOVE OLD REQUESTS
setInterval(() => {

  for (const [id, session] of sessions) {

    if (Date.now() - session.time > 900000) {
      sessions.delete(id);
    }

  }

}, 60000);

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("HECAR SERVER ONLINE");
});
