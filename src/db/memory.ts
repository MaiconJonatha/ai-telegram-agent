import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "memory.db");

let db: SqlJsDatabase;

// Inicializar banco de dados
function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  // Carregar banco existente ou criar novo
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log("💾 Banco de dados carregado:", DB_PATH);
  } else {
    db = new SQL.Database();
    console.log("💾 Novo banco de dados criado:", DB_PATH);
  }

  // Setup tables
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      language TEXT DEFAULT 'pt-BR',
      context TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  saveDb();
}

function saveDb(): void {
  try {
    const data = getDb().export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e: any) {
    console.log("[DB] Erro ao salvar:", e.message);
  }
}

export function saveMessage(userId: string, role: string, content: string): void {
  getDb().run("INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)", [userId, role, content]);
  saveDb();
}

export function getHistory(userId: string, limit: number = 20): Array<{role: string; content: string}> {
  const results: Array<{role: string; content: string}> = [];
  const stmt = getDb().prepare(
    "SELECT role, content FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
    [userId, limit]
  );
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    results.push({ role: row.role, content: row.content });
  }
  stmt.free();
  return results.reverse();
}

export function saveUserPreference(userId: string, name: string, context: string): void {
  getDb().run(
    "INSERT OR REPLACE INTO user_preferences (user_id, name, context) VALUES (?, ?, ?)",
    [userId, name, context]
  );
  saveDb();
}

export function getUserPreference(userId: string): {name: string; context: string} | undefined {
  const stmt = getDb().prepare("SELECT name, context FROM user_preferences WHERE user_id = ?", [userId]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    stmt.free();
    return { name: row.name, context: row.context };
  }
  stmt.free();
  return undefined;
}

export function clearHistory(userId: string): void {
  getDb().run("DELETE FROM conversations WHERE user_id = ?", [userId]);
  saveDb();
}
