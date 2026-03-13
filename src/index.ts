import "dotenv/config";
import http from "http";
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
    bot: "@ArcanjoBot_ia_bot",
    llm: ["Groq/Llama-70B", "Groq/Llama-8B", "Gemini-2.0-Flash", "HuggingFace/Llama-70B", "HuggingFace/Mixtral", "Cohere/Command-R+", "DeepSeek-Chat", "DeepSeek-Reasoner", "SiliconFlow/Qwen-72B", "SiliconFlow/GLM-4", "SiliconFlow/Yi-34B", "OpenRouter/Gemma", "OpenRouter/Mistral", "Claude-Opus-4", "Gemini-2.5-Pro"],
    images: ["Pollinations.ai", "HuggingFace/SDXL", "StableHorde"],
    audio: ["Groq/Whisper", "HuggingFace/Whisper"],
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
