import "dotenv/config";
import http from "http";
import bot from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`📡 Telegram Bot via Long Polling`);
console.log(`🧠 LLM: Groq → OpenRouter Free → Claude/Gemini Pro`);
console.log(`💾 Memória: SQLite (better-sqlite3)`);
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
console.log("---");

// Health check HTTP server (Render free tier needs a web service)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "online",
    bot: "@ArcanjoBot_ia_bot",
    llm: ["Groq/Llama-70B", "Groq/Llama-8B", "Gemini-2.0-Flash-Free", "Llama-70B-Free", "Qwen3-235B-Free", "Claude-Opus-4", "Gemini-2.5-Pro"],
    uptime: process.uptime(),
  }));
});

server.listen(PORT, () => {
  console.log(`🌐 Health server on port ${PORT}`);
});

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
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bot.stop();
  server.close();
  process.exit(0);
});
