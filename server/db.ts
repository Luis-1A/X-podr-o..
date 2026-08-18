import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

let db: Database | null = null;
const dbDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dbDir, 'mangaverse.sqlite');

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } catch (err) {
      console.error('Error reading existing sqlite database, creating new one:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      avatar TEXT,
      preferred_genres TEXT,
      preferred_languages TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS library (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      cover_url TEXT,
      author TEXT,
      artist TEXT,
      status TEXT,
      category TEXT DEFAULT 'reading',
      total_chapters INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, manga_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      manga_title TEXT,
      chapter_number TEXT,
      chapter_title TEXT,
      current_page INTEGER DEFAULT 1,
      total_pages INTEGER DEFAULT 1,
      percentage REAL DEFAULT 0,
      is_completed INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, manga_id, chapter_id)
    );

    CREATE TABLE IF NOT EXISTS reading_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      manga_title TEXT NOT NULL,
      chapter_number TEXT,
      chapter_title TEXT,
      cover_url TEXT,
      page INTEGER DEFAULT 1,
      total_pages INTEGER DEFAULT 1,
      read_at TEXT NOT NULL,
      UNIQUE(user_id, manga_id, chapter_id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      cover_url TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, manga_id)
    );

    CREATE TABLE IF NOT EXISTS user_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      lang TEXT DEFAULT 'pt-br',
      icon_url TEXT,
      UNIQUE(user_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS download_metadata (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_number TEXT,
      chapter_title TEXT,
      manga_title TEXT,
      cover_url TEXT,
      page_count INTEGER DEFAULT 0,
      size_bytes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      downloaded_at TEXT NOT NULL,
      UNIQUE(user_id, manga_id, chapter_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      reader_mode TEXT DEFAULT 'webtoon',
      reading_direction TEXT DEFAULT 'ltr',
      page_fit TEXT DEFAULT 'width',
      auto_download_next INTEGER DEFAULT 0,
      keep_downloads INTEGER DEFAULT 1,
      theme TEXT DEFAULT 'dark',
      preload_network TEXT DEFAULT 'all',
      max_cache_mb INTEGER DEFAULT 500,
      cache_retention_chapters INTEGER DEFAULT 3,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS source_error_logs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      manga_id TEXT,
      chapter_id TEXT,
      error_message TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  // Safe schema migrations for existing databases
  try {
    db.run("ALTER TABLE settings ADD COLUMN preload_network TEXT DEFAULT 'all'");
  } catch (e) {
    // Column already exists
  }
  try {
    db.run("ALTER TABLE settings ADD COLUMN max_cache_mb INTEGER DEFAULT 500");
  } catch (e) {
    // Column already exists
  }
  try {
    db.run("ALTER TABLE settings ADD COLUMN cache_retention_chapters INTEGER DEFAULT 3");
  } catch (e) {
    // Column already exists
  }

  saveDatabase();
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized! Call initDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Error saving SQLite database to disk:', err);
  }
}

function sanitizeParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

// Helper query wrappers for sql.js
export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(sanitizeParams(params));
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(sanitizeParams(params));
  let result: T | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject() as unknown as T;
  }
  stmt.free();
  return result;
}

export function run(sql: string, params: any[] = []): void {
  const database = getDb();
  database.run(sql, sanitizeParams(params));
  saveDatabase();
}
