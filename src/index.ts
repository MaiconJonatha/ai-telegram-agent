import "dotenv/config";
import http from "http";
import { initDatabase } from "./db/memory";
import bot from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`📡 Telegram Bot via Long Polling`);
console.log(`🧠 LLM: Groq → Gemini → HuggingFace → Cohere → DeepSeek → SiliconFlow → OpenRouter`);
console.log(`💾 Memória: SQLite (better-sqlite3)`);
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
console.log("---");

// Health check HTTP server (Render free tier needs a web service)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "online",
    llm: ["Groq", "Gemini", "HuggingFace", "Cohere", "DeepSeek", "OpenRouter"],
    images: ["Gemini-Imagen", "Pollinations", "HuggingFace/SDXL", "StableHorde"],
    video: ["Gemini-Veo"],
    audio: ["Groq/Whisper", "HuggingFace/Whisper"],
    coding: ["GitHub API"],
    uptime: process.uptime(),
  }));
});

server.listen(PORT, () => {
  console.log(`🌐 Health server on port ${PORT}`);
});

// Inicializar banco e bot
async function startBot() {
  // Inicializar SQLite
  await initDatabase();
  try {
    // Deletar webhook pra garantir que long polling funciona
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("🔄 Webhook limpo, iniciando long polling...");

    // Esperar 2s pra garantir que instância antiga morreu
    await new Promise(r => setTimeout(r, 2000));

    await bot.start({
      onStart: (botInfo) => {
        console.log(`✅ Bot @${botInfo.username} está online!`);
        console.log(`🔗 https://t.me/${botInfo.username}`);
      },
    });
  } catch (e: any) {
    console.error("❌ Erro ao iniciar bot:", e.message);
    // Se for conflito, esperar e tentar de novo
    if (e.message?.includes("409") || e.message?.includes("Conflict")) {
      console.log("⏳ Conflito detectado, esperando 5s e tentando novamente...");
      await new Promise(r => setTimeout(r, 5000));
      await startBot();
    } else {
      process.exit(1);
    }
  }
}

startBot();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Desligando bot...");
  bot.stop();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bot.stop();
  server.close();
  process.exit(0);
});
