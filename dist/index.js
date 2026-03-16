"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const memory_1 = require("./db/memory");
const bot_1 = __importDefault(require("./telegram/bot"));
const pg_1 = require("pg");
const sse_1 = require("./sse");
const PORT = parseInt(process.env.PORT || "10000");
const startTime = Date.now();
const APP_VERSION = "1.0.0";
const sseClients = (0, sse_1.getSseClients)();
console.log("🚀 Iniciando Opencrawsbuties...");
console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
// Health & API server
const server = http_1.default.createServer(async (req, res) => {
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
    const method = req.method || 'GET';
    // SSE endpoint for real-time dashboard updates
    if (url === '/api/events' && method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });
        sseClients.add(res);
        // Send initial connection event
        res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
        // Send heartbeat every 30s to keep connection alive
        const heartbeat = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
            }
            catch (e) {
                clearInterval(heartbeat);
                sseClients.delete(res);
            }
        }, 30000);
        // Remove client on disconnect
        req.on('close', () => {
            clearInterval(heartbeat);
            sseClients.delete(res);
        });
        return; // Keep connection open
    }
    // Parse JSON body for POST requests
    const parseBody = () => {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', (chunk) => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                }
                catch {
                    resolve({});
                }
            });
        });
    };
    try {
        // GET /api/health
        if (url === '/api/health' && req.method === 'GET') {
            let dbStatus = "unknown";
            try {
                const pool = new pg_1.Pool({
                    connectionString: process.env.DATABASE_URL || "",
                    ssl: { rejectUnauthorized: false },
                    max: 1,
                });
                const client = await pool.connect();
                await client.query("SELECT 1");
                client.release();
                await pool.end();
                dbStatus = "connected";
            }
            catch (e) {
                dbStatus = `error: ${e.message}`;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: "online",
                version: APP_VERSION,
                uptime: process.uptime(),
                uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
                startedAt: new Date(startTime).toISOString(),
                database: dbStatus,
            }));
            return;
        }
        // GET /api/media/recent
        if (url === '/api/media/recent' && req.method === 'GET') {
            try {
                const pool = new pg_1.Pool({
                    connectionString: process.env.DATABASE_URL || "",
                    ssl: { rejectUnauthorized: false },
                    max: 1,
                });
                const result = await pool.query("SELECT id, user_id, type, prompt, provider, file_size, created_at FROM media_log ORDER BY created_at DESC LIMIT 5");
                await pool.end();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result.rows));
            }
            catch (e) {
                console.error(`[${new Date().toISOString()}] [API] media/recent error:`, e.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to fetch recent media', details: e.message }));
            }
            return;
        }
        // GET /api/stats
        if (url === '/api/stats' && req.method === 'GET') {
            const stats = await (0, memory_1.getStats)();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats));
            return;
        }
        // GET /api/activity
        if (url === '/api/activity' && req.method === 'GET') {
            const activity = await (0, memory_1.getRecentActivity)();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(activity));
            return;
        }
        // GET /api/agents
        if (url === '/api/agents' && req.method === 'GET') {
            const agents = await (0, memory_1.getAgentStats)();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(agents));
            return;
        }
        // GET /api/conversations/:userId
        if (url.startsWith('/api/conversations') && req.method === 'GET') {
            const userId = url.split('/api/conversations/')[1];
            if (userId) {
                const { getHistory } = await Promise.resolve().then(() => __importStar(require('./db/memory')));
                const history = await getHistory(decodeURIComponent(userId));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(history));
            }
            else {
                const counts = await (0, memory_1.getConversationCounts)();
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
                try {
                    (0, memory_1.saveMessage)(userId, role, content);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                }
                catch (e) {
                    console.error(`[${new Date().toISOString()}] [API] vision/chat save error:`, e.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to save message', details: e.message }));
                }
            }
            else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing fields: userId, role, content required' }));
            }
            return;
        }
        // Default: health check
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "online", uptime: process.uptime() }));
    }
    catch (e) {
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
bot_1.default.catch((err) => {
    console.error("❌ Bot error:", err.message);
});
process.on("uncaughtException", (e) => {
    console.error("❌ Uncaught:", e.message);
});
process.on("unhandledRejection", (e) => {
    console.error("❌ Unhandled:", e?.message || e);
});
// Start
async function main() {
    await (0, memory_1.initDatabase)();
    // Limpar webhook
    const token = process.env.TELEGRAM_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`);
    console.log("🔄 Webhook limpo");
    // Esperar antes de iniciar polling
    await new Promise(r => setTimeout(r, 5000));
    // Iniciar polling
    console.log("📡 Iniciando polling...");
    bot_1.default.start({
        onStart: (info) => console.log(`✅ Bot @${info.username} online!`),
    });
}
main().catch((e) => {
    console.error("❌ Fatal:", e.message);
});
process.on("SIGTERM", () => {
    bot_1.default.stop();
    server.close();
    process.exit(0);
});
// build 1773459334
//# sourceMappingURL=index.js.map