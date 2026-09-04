import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initDatabase() {
  console.log('Initializing SQLite database schema...');
  
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema creation
  db.exec(schemaSql);
  console.log('✔ Tables created or verified.');

  // Seed default hardcoded user if not exists
  const existingUser = db.prepare('SELECT id, name FROM users WHERE id = ?').get(1);
  if (!existingUser) {
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(1, 'Trader Alex');
    console.log('✔ Hardcoded test user seeded: ID 1 - "Trader Alex"');
  } else {
    console.log(`✔ Existing test user found: ID ${existingUser.id} - "${existingUser.name}"`);
  }

  // Verification report
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  console.log('\n--- Database Tables ---');
  for (const table of tables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get();
    console.log(` • ${table.name.padEnd(16)} (rows: ${count.count})`);
  }

  const currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
  console.log('\n--- Test User Info ---');
  console.log(` User ID: ${currentUser.id}`);
  console.log(` Name:    ${currentUser.name}\n`);
  console.log('Database initialization completed successfully!');
}

// Run directly if executed as script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    initDatabase();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}
