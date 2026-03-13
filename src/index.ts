import "dotenv/config";
import http from "http";
import { initDatabase } from "./db/memory";
import bot from "./telegram/bot";
import { webhookCallback } from "grammy";

const PORT = parseInt(process.env.PORT || "10000");
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "";

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`🧠 LLM: Groq → Gemini → HuggingFace → Cohere → DeepSeek → OpenRouter`);
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
console.log("---");

async function start() {
  // Inicializar banco de dados
  await initDatabase();

  // Se tem URL do Render, usar webhook (mais estável)
  if (RENDER_URL) {
    const webhookUrl = `${RENDER_URL}/webhook`;
    console.log(`📡 Modo: Webhook → ${webhookUrl}`);

    await bot.api.setWebhook(webhookUrl, { drop_pending_updates: true });
    console.log("✅ Webhook configurado!");

    const handleUpdate = webhookCallback(bot, "http");

    const server = http.createServer(async (req, res) => {
      if (req.url === "/webhook" && req.method === "POST") {
        // Processar update do Telegram
        await handleUpdate(req, res);
      } else {
        // Health check
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "online",
          mode: "webhook",
          uptime: process.uptime(),
        }));
      }
    });

    server.listen(PORT, () => {
      console.log(`🌐 Server on port ${PORT}`);
      console.log(`✅ Bot está online!`);
    });

  } else {
    // Fallback: long polling (dev local)
    console.log("📡 Modo: Long Polling (dev)");

    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "online", mode: "polling", uptime: process.uptime() }));
    });

    server.listen(PORT, () => {
      console.log(`🌐 Health server on port ${PORT}`);
    });

    await bot.api.deleteWebhook({ drop_pending_updates: true });

    bot.start({
      onStart: (botInfo) => {
        console.log(`✅ Bot @${botInfo.username} está online!`);
      },
    });
  }
}

start().catch((e) => {
  console.error("❌ Erro fatal:", e.message);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  bot.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bot.stop();
  process.exit(0);
});
