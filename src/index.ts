import "dotenv/config";
import http from "http";
import { initDatabase } from "./db/memory";
import bot from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando Opencrawsbuties...");
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);

// Health check server
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", uptime: process.uptime() }));
});

server.listen(PORT, () => {
  console.log(`🌐 Health server on port ${PORT}`);
}).on("error", () => {
  console.log(`⚠️ Porta ${PORT} em uso, health server ignorado`);
});

// Catch errors sem crashar
bot.catch((err) => {
  console.error("❌ Bot error:", err.message);
});

process.on("uncaughtException", (e) => {
  console.error("❌ Uncaught:", e.message);
});

process.on("unhandledRejection", (e: any) => {
  console.error("❌ Unhandled:", e?.message || e);
});

// Start
async function main() {
  await initDatabase();

  // Limpar webhook
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`);
  console.log("🔄 Webhook limpo");

  // Esperar antes de iniciar polling
  await new Promise(r => setTimeout(r, 5000));

  // Iniciar polling
  console.log("📡 Iniciando polling...");
  bot.start({
    onStart: (info) => console.log(`✅ Bot @${info.username} online!`),
  });
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
});

process.on("SIGTERM", () => {
  bot.stop();
  server.close();
  process.exit(0);
});
// build 1773459334
