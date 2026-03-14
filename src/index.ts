import "dotenv/config";
import http from "http";
import { initDatabase } from "./db/memory";
import bot from "./telegram/bot";
import { webhookCallback } from "grammy";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`🧠 LLM: Groq → Gemini → HuggingFace → Cohere → DeepSeek → OpenRouter`);
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
console.log("---");

const handleUpdate = webhookCallback(bot, "http");

const server = http.createServer(async (req, res) => {
  if (req.url === "/webhook" && req.method === "POST") {
    try {
      await handleUpdate(req, res);
    } catch (e: any) {
      console.error("❌ Webhook error:", e.message);
      res.writeHead(200);
      res.end();
    }
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "online", mode: "webhook", uptime: process.uptime() }));
  }
});

async function start() {
  await initDatabase();

  const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/webhook`
    : `https://arcanjobot.onrender.com/webhook`;

  // Sempre configurar webhook no startup (Render free tier pode dormir e resetar)
  console.log(`📡 Configurando webhook: ${WEBHOOK_URL}`);
  await bot.api.setWebhook(WEBHOOK_URL, {
    drop_pending_updates: false,
    allowed_updates: ["message", "callback_query"],
  });
  console.log("✅ Webhook configurado!");

  server.listen(PORT, () => {
    console.log(`🌐 Server on port ${PORT}`);
    console.log("✅ Bot está online e pronto!");
  });
}

start().catch((e) => {
  console.error("❌ Erro fatal:", e.message);
  process.exit(1);
});

bot.catch((err) => {
  console.error("❌ Bot error:", err.message);
});

process.on("uncaughtException", (e) => {
  console.error("❌ Uncaught:", e.message);
});

process.on("unhandledRejection", (e: any) => {
  console.error("❌ Unhandled:", e?.message || e);
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
