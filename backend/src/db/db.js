import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'market.db');

const db = new Database(dbPath);

// Enable WAL mode for better concurrency and foreign keys for relational integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migration: add 'source' column to price_history if it doesn't exist yet.
// Using try/catch because SQLite doesn't support IF NOT EXISTS for ALTER TABLE.
// Safe to run on both fresh and existing databases.
try {
  db.exec("ALTER TABLE price_history ADD COLUMN source TEXT DEFAULT 'simulated'");
  console.log('[DB] Migrated: added source column to price_history');
} catch {
  // Column already exists — this is the normal case after first run
}

export default db;
