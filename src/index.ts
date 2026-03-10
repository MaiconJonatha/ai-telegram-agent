import "dotenv/config";
import bot from "./telegram/bot";

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`📡 Telegram Bot via Long Polling`);
console.log(`🧠 LLM: Groq → OpenRouter → Ollama (fallback)`);
console.log(`💾 Memória: SQLite (better-sqlite3)`);
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
console.log("---");

// Iniciar bot com long polling
bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot @${botInfo.username} está online!`);
    console.log(`🔗 https://t.me/${botInfo.username}`);
  },
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Desligando bot...");
  bot.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bot.stop();
  process.exit(0);
});
