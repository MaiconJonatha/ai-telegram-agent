import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        name TEXT,
        language TEXT DEFAULT 'pt-BR',
        context TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_log (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT,
        provider TEXT,
        file_size INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_log (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        action TEXT,
        status TEXT DEFAULT 'success',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("💾 PostgreSQL conectado (Neon):", DATABASE_URL.split("@")[1]?.split("/")[0] || "neon");
  } finally {
    client.release();
  }
}

export function saveMessage(userId: string, role: string, content: string): void {
  pool.query("INSERT INTO conversations (user_id, role, content) VALUES ($1, $2, $3)", [userId, role, content])
    .catch(e => console.log("[DB] Erro ao salvar:", e.message));
}

export async function getHistory(userId: string, limit: number = 20): Promise<Array<{role: string; content: string}>> {
  try {
    const res = await pool.query(
      "SELECT role, content FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2",
      [userId, limit]
    );
    return res.rows.reverse();
  } catch (e: any) {
    console.log("[DB] Erro ao buscar histórico:", e.message);
    return [];
  }
}

export function saveUserPreference(userId: string, name: string, context: string): void {
  pool.query(
    "INSERT INTO user_preferences (user_id, name, context) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET name = $2, context = $3",
    [userId, name, context]
  ).catch(e => console.log("[DB] Erro ao salvar preferência:", e.message));
}

export async function getUserPreference(userId: string): Promise<{name: string; context: string} | undefined> {
  try {
    const res = await pool.query("SELECT name, context FROM user_preferences WHERE user_id = $1", [userId]);
    return res.rows[0] || undefined;
  } catch {
    return undefined;
  }
}

export function clearHistory(userId: string): void {
  pool.query("DELETE FROM conversations WHERE user_id = $1", [userId])
    .catch(e => console.log("[DB] Erro ao limpar:", e.message));
}

export function logMedia(userId: string, type: string, prompt: string, provider: string, fileSize: number): void {
  pool.query(
    "INSERT INTO media_log (user_id, type, prompt, provider, file_size) VALUES ($1, $2, $3, $4, $5)",
    [userId, type, prompt, provider, fileSize]
  ).catch(e => console.log("[DB] Erro ao logar mídia:", e.message));
}

export function logAgent(userId: string, agent: string, action: string, status: string = "success"): void {
  pool.query(
    "INSERT INTO agent_log (user_id, agent, action, status) VALUES ($1, $2, $3, $4)",
    [userId, agent, action, status]
  ).catch(e => console.log("[DB] Erro ao logar agente:", e.message));
}

// ── API Query Functions ──

export async function getStats(): Promise<{
  messagesTotal: number;
  messagesToday: number;
  imagesTotal: number;
  videosTotal: number;
}> {
  const client = await pool.connect();
  try {
    const msgs = await client.query("SELECT COUNT(*) as total FROM conversations");
    const msgsToday = await client.query("SELECT COUNT(*) as total FROM conversations WHERE timestamp > CURRENT_DATE");
    const images = await client.query("SELECT COUNT(*) as total FROM media_log WHERE type = 'image'");
    const videos = await client.query("SELECT COUNT(*) as total FROM media_log WHERE type = 'video'");
    return {
      messagesTotal: parseInt(msgs.rows[0].total),
      messagesToday: parseInt(msgsToday.rows[0].total),
      imagesTotal: parseInt(images.rows[0].total),
      videosTotal: parseInt(videos.rows[0].total),
    };
  } finally {
    client.release();
  }
}

export async function getRecentActivity(limit: number = 10): Promise<any[]> {
  const res = await pool.query(`
    (SELECT 'media' as source, type, prompt as description, provider, created_at FROM media_log ORDER BY created_at DESC LIMIT $1)
    UNION ALL
    (SELECT 'agent' as source, agent as type, action as description, status as provider, created_at FROM agent_log ORDER BY created_at DESC LIMIT $1)
    ORDER BY created_at DESC LIMIT $1
  `, [limit]);
  return res.rows;
}

export async function getAgentStats(): Promise<any[]> {
  const res = await pool.query(`
    SELECT agent as name, COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as success_count,
      MAX(created_at) as last_used
    FROM agent_log
    GROUP BY agent
    ORDER BY total DESC
  `);
  return res.rows;
}

export async function getConversationCounts(): Promise<any[]> {
  const res = await pool.query(`
    SELECT user_id, COUNT(*) as message_count
    FROM conversations
    GROUP BY user_id
    ORDER BY message_count DESC
    LIMIT 20
  `);
  return res.rows;
}
