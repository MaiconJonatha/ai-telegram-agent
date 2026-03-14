import "dotenv/config";
import http from "http";
import { initDatabase } from "./db/memory";
import bot from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`🧠 LLM: Groq → Gemini → HuggingFace → Cohere → DeepSeek → OpenRouter`);
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
console.log("---");

// Health check server (mantém Render ativo)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", uptime: process.uptime() }));
});

server.listen(PORT, () => {
  console.log(`🌐 Health server on port ${PORT}`);
});

// Catch all errors pra não crashar
bot.catch((err) => {
  console.error("❌ Bot error:", err.message);
});

process.on("uncaughtException", (e) => {
  console.error("❌ Uncaught:", e.message);
});

process.on("unhandledRejection", (e: any) => {
  console.error("❌ Unhandled:", e?.message || e);
});

// Start bot com retry
async function startBot() {
  await initDatabase();

  // Limpar webhook
  const token = process.env.TELEGRAM_BOT_TOKEN;
  console.log("🔄 Limpando webhook...");
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`);

  // Esperar pra qualquer instância antiga morrer
  console.log("⏳ Aguardando 5s...");
  await new Promise(r => setTimeout(r, 5000));

  // Iniciar polling com retry
  async function poll() {
    try {
      console.log("📡 Iniciando Long Polling...");
      await bot.start({
        onStart: (info) => {
          console.log(`✅ Bot @${info.username} está online!`);
        },
      });
    } catch (e: any) {
      if (e.message?.includes("409") || e.message?.includes("Conflict")) {
        console.log("⚠️ Conflito detectado, aguardando 10s...");
        await new Promise(r => setTimeout(r, 10000));
        await poll();
      } else {
        console.error("❌ Polling erro:", e.message);
        console.log("🔄 Retry em 15s...");
        await new Promise(r => setTimeout(r, 15000));
        await poll();
      }
    }
  }

  await poll();
}

startBot();

process.on("SIGTERM", () => {
  bot.stop();
  server.close();
  process.exit(0);
});
