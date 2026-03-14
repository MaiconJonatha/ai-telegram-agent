import "dotenv/config";
import http from "http";
import { initDatabase } from "./db/memory";
import bot from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando ArcanjoBot...");
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);

// Health check server
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", uptime: process.uptime() }));
});

server.listen(PORT, () => {
  console.log(`🌐 Health server on port ${PORT}`);
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

  // Esperar 3s
  await new Promise(r => setTimeout(r, 3000));

  // Iniciar polling - sem retry (evita loop de conflito)
  console.log("📡 Iniciando polling...");
  bot.start({
    onStart: (info) => console.log(`✅ Bot @${info.username} online!`),
  });
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  // NÃO process.exit - manter health server vivo
});

process.on("SIGTERM", () => {
  bot.stop();
  server.close();
  process.exit(0);
});
