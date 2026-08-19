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

  // 1. Core Users and Profiles
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      user_agent TEXT,
      ip_hash TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 2. Mangas & Aliases (Multi-Source Identity)
    CREATE TABLE IF NOT EXISTS mangas (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      alternative_titles TEXT,
      description TEXT,
      cover_url TEXT,
      banner_url TEXT,
      author TEXT,
      artist TEXT,
      status TEXT DEFAULT 'ongoing',
      genres TEXT,
      year INTEGER,
      country TEXT,
      language TEXT,
      type TEXT,
      rating REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS manga_aliases (
      id TEXT PRIMARY KEY,
      manga_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      language TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(manga_id) REFERENCES mangas(id) ON DELETE CASCADE
    );

    -- 3. Sources & Extension Catalog
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT,
      extension_id TEXT,
      language TEXT DEFAULT 'pt-br',
      status TEXT DEFAULT 'active',
      version TEXT,
      last_checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manga_sources (
      id TEXT PRIMARY KEY,
      manga_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_manga_id TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT,
      source_cover_url TEXT,
      chapter_count INTEGER DEFAULT 0,
      last_checked_at TEXT,
      status TEXT DEFAULT 'active',
      UNIQUE(manga_id, source_id, source_manga_id),
      FOREIGN KEY(manga_id) REFERENCES mangas(id) ON DELETE CASCADE
    );

    -- 4. Canonical Chapters & Chapter Sources
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      manga_id TEXT NOT NULL,
      chapter_number TEXT NOT NULL,
      volume_number TEXT,
      title TEXT,
      normalized_number REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(manga_id, chapter_number),
      FOREIGN KEY(manga_id) REFERENCES mangas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_sources (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_chapter_id TEXT NOT NULL,
      source_url TEXT,
      chapter_title TEXT,
      available INTEGER DEFAULT 1,
      last_checked_at TEXT,
      UNIQUE(chapter_id, source_id, source_chapter_id),
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    -- 5. User Library, Favorites, Progress, History
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
      source_id TEXT,
      manga_title TEXT NOT NULL,
      chapter_number TEXT,
      chapter_title TEXT,
      cover_url TEXT,
      page INTEGER DEFAULT 1,
      total_pages INTEGER DEFAULT 1,
      read_at TEXT NOT NULL,
      UNIQUE(user_id, manga_id, chapter_id)
    );

    CREATE TABLE IF NOT EXISTS user_manga_status (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
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

    -- 6. Search Cache & History
    CREATE TABLE IF NOT EXISTS search_cache (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      normalized_query TEXT NOT NULL UNIQUE,
      result_data TEXT NOT NULL,
      sources_count INTEGER DEFAULT 0,
      total_results INTEGER DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      query TEXT NOT NULL,
      normalized_query TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 7. Diagnostic & Audit Logs
    CREATE TABLE IF NOT EXISTS source_error_logs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      manga_id TEXT,
      chapter_id TEXT,
      error_message TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_mangas_title ON mangas(title);
    CREATE INDEX IF NOT EXISTS idx_manga_aliases_norm ON manga_aliases(normalized_alias);
    CREATE INDEX IF NOT EXISTS idx_manga_sources_manga ON manga_sources(manga_id);
    CREATE INDEX IF NOT EXISTS idx_manga_sources_src ON manga_sources(source_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_norm ON chapters(normalized_number);
    CREATE INDEX IF NOT EXISTS idx_chapter_sources_ch ON chapter_sources(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_reading_history_user ON reading_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_reading_prog_user_manga ON reading_progress(user_id, manga_id);
    CREATE INDEX IF NOT EXISTS idx_search_cache_norm ON search_cache(normalized_query);
  `);

  // Safe schema migrations for existing databases
  const migrations = [
    "ALTER TABLE users ADD COLUMN avatar_url TEXT",
    "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'",
    "ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE settings ADD COLUMN preload_network TEXT DEFAULT 'all'",
    "ALTER TABLE settings ADD COLUMN max_cache_mb INTEGER DEFAULT 500",
    "ALTER TABLE settings ADD COLUMN cache_retention_chapters INTEGER DEFAULT 3",
    "ALTER TABLE reading_history ADD COLUMN source_id TEXT",
  ];

  for (const mig of migrations) {
    try {
      db.run(mig);
    } catch (e) {
      // column or table already exists
    }
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

/**
 * Diagnostic health check routine for the database and system integrity
 */
export function getDatabaseDiagnostics() {
  try {
    const usersCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users')?.count || 0;
    const mangasCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM mangas')?.count || 0;
    const chaptersCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM chapters')?.count || 0;
    const sourcesCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sources')?.count || 0;
    const cacheCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM search_cache')?.count || 0;
    const errorLogsCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM source_error_logs')?.count || 0;

    return {
      status: 'healthy',
      database: 'SQLite (sql.js persistent)',
      path: dbPath,
      tables: {
        users: usersCount,
        mangas: mangasCount,
        chapters: chaptersCount,
        sources: sourcesCount,
        search_cache: cacheCount,
        error_logs: errorLogsCount,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

