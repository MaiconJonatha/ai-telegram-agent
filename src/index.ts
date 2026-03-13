import "dotenv/config";
import http from "http";
import { initDatabase } from "./db/memory";
import bot from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`🧠 LLM: Groq → Gemini → HuggingFace → Cohere → DeepSeek → OpenRouter`);
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
console.log("---");

// Health check HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", uptime: process.uptime() }));
});

server.listen(PORT, () => {
  console.log(`🌐 Health server on port ${PORT}`);
});

async function start() {
  // Inicializar banco de dados
  await initDatabase();

  // Deletar webhook e limpar updates pendentes
  console.log("🔄 Limpando webhook antigo...");
  await bot.api.deleteWebhook({ drop_pending_updates: true });

  // Esperar pra garantir que não tem outra instância
  console.log("⏳ Aguardando 3s...");
  await new Promise(r => setTimeout(r, 3000));

  console.log("📡 Iniciando Long Polling...");
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot @${botInfo.username} está online!`);
      console.log(`🔗 https://t.me/${botInfo.username}`);
    },
  });
}

start().catch((e) => {
  console.error("❌ Erro fatal:", e.message);
  // Não sair imediatamente - manter o health server rodando
  // pra evitar restart loop no Render
  console.log("⚠️ Bot offline, health server mantido ativo. Retry em 30s...");
  setTimeout(() => {
    start().catch((e2) => {
      console.error("❌ Segundo erro:", e2.message);
    });
  }, 30000);
});

// Catch unhandled errors pra não crashar
bot.catch((err) => {
  console.error("❌ Bot error:", err.message);
});

process.on("uncaughtException", (e) => {
  console.error("❌ Uncaught:", e.message);
});

process.on("unhandledRejection", (e: any) => {
  console.error("❌ Unhandled:", e?.message || e);
});

// Graceful shutdown
process.on("SIGINT", () => {
  bot.stop();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bot.stop();
  server.close();
  process.exit(0);
});
