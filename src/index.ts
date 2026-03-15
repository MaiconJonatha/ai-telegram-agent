import "dotenv/config";
import http from "http";
import { initDatabase, getStats, getRecentActivity, getAgentStats, getConversationCounts, saveMessage } from "./db/memory";
import bot from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "10000");

console.log("🚀 Iniciando Opencrawsbuties...");
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);

// Health & API server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';

  // Parse JSON body for POST requests
  const parseBody = (): Promise<any> => {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
  };

  try {
    // GET /api/stats
    if (url === '/api/stats' && req.method === 'GET') {
      const stats = await getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }

    // GET /api/activity
    if (url === '/api/activity' && req.method === 'GET') {
      const activity = await getRecentActivity();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(activity));
      return;
    }

    // GET /api/agents
    if (url === '/api/agents' && req.method === 'GET') {
      const agents = await getAgentStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agents));
      return;
    }

    // GET /api/conversations/:userId
    if (url.startsWith('/api/conversations') && req.method === 'GET') {
      const userId = url.split('/api/conversations/')[1];
      if (userId) {
        const { getHistory } = await import('./db/memory');
        const history = await getHistory(decodeURIComponent(userId));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(history));
      } else {
        const counts = await getConversationCounts();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(counts));
      }
      return;
    }

    // POST /api/vision/chat
    if (url === '/api/vision/chat' && req.method === 'POST') {
      const body = await parseBody();
      const { userId, role, content } = body;
      if (userId && role && content) {
        saveMessage(userId, role, content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing fields: userId, role, content required' }));
      }
      return;
    }

    // Default: health check
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "online", uptime: process.uptime() }));

  } catch (e: any) {
    console.error('❌ API error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Database error' }));
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Health + API server on port ${PORT}`);
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
