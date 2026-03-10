import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "../../memory.db");

const db: InstanceType<typeof Database> = new Database(DB_PATH);

// Setup tables for persistent memory
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    language TEXT DEFAULT 'pt-BR',
    context TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export function saveMessage(userId: string, role: string, content: string): void {
  const stmt = db.prepare("INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)");
  stmt.run(userId, role, content);
}

export function getHistory(userId: string, limit: number = 20): Array<{role: string; content: string}> {
  const stmt = db.prepare(
    "SELECT role, content FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?"
  );
  return stmt.all(userId, limit).reverse() as Array<{role: string; content: string}>;
}

export function saveUserPreference(userId: string, name: string, context: string): void {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO user_preferences (user_id, name, context) VALUES (?, ?, ?)"
  );
  stmt.run(userId, name, context);
}

export function getUserPreference(userId: string): {name: string; context: string} | undefined {
  const stmt = db.prepare("SELECT name, context FROM user_preferences WHERE user_id = ?");
  return stmt.get(userId) as {name: string; context: string} | undefined;
}

export function clearHistory(userId: string): void {
  const stmt = db.prepare("DELETE FROM conversations WHERE user_id = ?");
  stmt.run(userId);
}

export default db;
