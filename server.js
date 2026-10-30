
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");
const path = require("path");

const app = express();

// ================================
// HECAR CONFIGURATION
// ================================

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const SESSION_TIME = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

// ================================
// SECURITY
// ================================

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.json({ limit: "10kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// ================================
// CONFIG CHECK
// ================================

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error("HECAR ERROR: Missing environment variables");
  process.exit(1);
}

// ================================
// TELEGRAM BOT
// ================================

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

bot.on("polling_error", (error) => {
  console.error("TELEGRAM POLLING ERROR:", error.message);
});

bot.on("error", (error) => {
  console.error("BOT ERROR:", error.message);
});

// ================================
// DATABASE (TEMPORARY MEMORY)
// ================================

const sessions = new Map();
const requestLimits = new Map();

// ================================
// HELPER FUNCTIONS
// ================================

function log(message) {
  console.log(
    `[HECAR ${new Date().toISOString()}] ${message}`
  );
}

function isAdmin(chatId) {
  return String(chatId) === String(ADMIN_CHAT_ID);
}

function rateLimit(req, res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();

  let record = requestLimits.get(ip);

  if (!record || now - record.time > 60000) {
    record = { count: 0, time: now };
  }

  record.count++;
  requestLimits.set(ip, record);

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many requests. Try again later."
    });
  }

  next();
}

// ================================
// HOME PAGE
// ================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// ================================
// HEALTH CHECK
// ================================

app.get("/health", (req, res) => {
  res.json({
    app: "HECAR",
    status: "online",
    time: new Date().toISOString()
  });
});

// ================================
// TELEGRAM START COMMAND
// ================================

bot.onText(/^\/start$/, async (msg) => {
  try {
    if (!isAdmin(msg.chat.id)) {
      return bot.sendMessage(
        msg.chat.id,
        "HECAR Bot is private. Admin access is required."
      );
    }

    await bot.sendMessage(
      msg.chat.id,
      "⚡ WELCOME TO HECAR ADMIN ⚡\n\n" +
      "🟢 Bot Status: Online\n" +
      "🔐 Approval System: Active\n\n" +
      "Commands:\n" +
      "/start - Start bot\n" +
      "/status - Server status\n" +
      "/help - Help menu"
    );

  } catch (error) {
    log("START COMMAND ERROR: " + error.message);
  }
});

// ================================
// HELP COMMAND
// ================================

bot.onText(/^\/help$/, async (msg) => {
  if (!isAdmin(msg.chat.id)) return;

  bot.sendMessage(
    msg.chat.id,
    "HECAR ADMIN HELP\n\n" +
    "APPROVE: Allow access\n" +
    "REJECT: Deny access\n" +
    "/status: Check pending requests\n" +
    "/help: Show help"
  );
});

// ================================
// STATUS COMMAND
// ================================

bot.onText(/^\/status$/, async (msg) => {
  if (!isAdmin(msg.chat.id)) return;

  const pending = [...sessions.values()]
    .filter(s => s.status === "pending").length;

  bot.sendMessage(
    msg.chat.id,
    "🟢 HECAR SERVER ONLINE\n\n" +
    "Pending Requests: " + pending + "\n" +
    "Total Sessions: " + sessions.size
  );
});

// ================================
// REQUEST ACCESS
// ================================

app.post("/api/request", rateLimit, async (req, res) => {

  const id = crypto.randomBytes(24).toString("hex");

  const device = String(
    req.body.device || "Unknown device"
  ).slice(0, 120);

  const session = {
    id,
    device,
    status: "pending",
    createdAt: Date.now()
  };

  sessions.set(id, session);

  try {

    await bot.sendMessage(
      ADMIN_CHAT_ID,

      "🔐 HECAR ACCESS REQUEST\n\n" +
      "📱 Device: " + device + "\n" +
      "🕒 Time: " + new Date().toLocaleString() +
      "\n\nPlease review this request.",

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

    log("NEW ACCESS REQUEST: " + id);

    res.json({
      success: true,
      id,
      status: "pending"
    });

  } catch (error) {

    sessions.delete(id);

    console.error(
      "TELEGRAM SEND ERROR:",
      error.response?.body || error.message
    );

    res.status(502).json({
      error: "Telegram message failed"
    });

  }

});

// ================================
// ADMIN APPROVAL HANDLER
// ================================

bot.on("callback_query", async (query) => {

  try {

    if (!query.message || !query.message.chat) {
      return bot.answerCallbackQuery(query.id);
    }

    if (!isAdmin(query.message.chat.id)) {
      return bot.answerCallbackQuery(query.id, {
        text: "Unauthorized admin!",
        show_alert: true
      });
    }

    const data = String(query.data || "");
    const [action, id] = data.split(":");

    if (!["approve", "reject"].includes(action)) {
      return bot.answerCallbackQuery(query.id, {
        text: "Invalid action"
      });
    }

    const session = sessions.get(id);

    if (!session || session.status !== "pending") {
      return bot.answerCallbackQuery(query.id, {
        text: "Request expired or already processed",
        show_alert: true
      });
    }

    session.status =
      action === "approve" ? "approved" : "rejected";

    session.updatedAt = Date.now();

    await bot.answerCallbackQuery(query.id, {
      text: action === "approve"
        ? "Access approved!"
        : "Access rejected!"
    });

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: ADMIN_CHAT_ID,
        message_id: query.message.message_id
      }
    );

    await bot.sendMessage(
      ADMIN_CHAT_ID,
      action === "approve"
        ? "✅ ACCESS APPROVED"
        : "❌ ACCESS REJECTED"
    );

    log("REQUEST " + action.toUpperCase() + ": " + id);

  } catch (error) {
    log("APPROVAL ERROR: " + error.message);
  }

});

// ================================
// CHECK ACCESS STATUS
// ================================

app.get("/api/status/:id", (req, res) => {

  const id = req.params.id;

  if (!/^[a-f0-9]{48}$/.test(id)) {
    return res.status(400).json({
      status: "invalid"
    });
  }

  const session = sessions.get(id);

  if (!session) {
    return res.json({
      status: "expired"
    });
  }

  if (Date.now() - session.createdAt > SESSION_TIME) {

    sessions.delete(id);

    return res.json({
      status: "expired"
    });

  }

  res.json({
    status: session.status
  });

});

// ================================
// EXIT NOTIFICATION
// ================================

app.post("/api/exit", async (req, res) => {

  const id = String(req.body.id || "");

  if (!/^[a-f0-9]{48}$/.test(id)) {
    return res.status(400).json({
      error: "Invalid session"
    });
  }

  const session = sessions.get(id);

  if (!session) {
    return res.json({ ok: true });
  }

  if (session.status === "approved") {

    sessions.delete(id);

    try {

      await bot.sendMessage(
        ADMIN_CHAT_ID,

        "🚪 HECAR EXIT NOTICE\n\n" +
        "Device: " + session.device + "\n" +
        "Time: " + new Date().toLocaleString()
      );

    } catch (error) {

      log("EXIT NOTIFICATION ERROR: " + error.message);

    }

  }

  res.json({ ok: true });

});

// ================================
// AUTOMATIC SESSION CLEANUP
// ================================

setInterval(() => {

  const now = Date.now();

  for (const [id, session] of sessions) {

    if (now - session.createdAt > SESSION_TIME) {
      sessions.delete(id);
    }

  }

  for (const [ip, record] of requestLimits) {

    if (now - record.time > 60000) {
      requestLimits.delete(ip);
    }

  }

}, 60000);

// ================================
// SERVER START
// ================================

app.listen(PORT, () => {

  console.log("");
  console.log("================================");
  console.log("       HECAR CYBER SYSTEM");
  console.log("================================");
  console.log("SERVER: ONLINE");
  console.log("PORT: " + PORT);
  console.log("TELEGRAM: CONNECTED");
  console.log("APPROVAL SYSTEM: READY");
  console.log("================================");
  console.log("");

});
