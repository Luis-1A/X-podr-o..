import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';
import { initDatabase, queryAll, queryOne, run } from './server/db.js';
import {
  searchMangaAggregated,
  searchMangaDex,
  getMangaDetails,
  getMangaChapters,
  getChapterPages,
  checkMangaUpdates,
  getRecommendations,
  getKeiyoushiExtensions,
} from './server/mangaService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'xpodrao-secure-jwt-token-secret-2026';
const LEGACY_JWT_SECRETS = ['mangaverse-secure-jwt-token-secret-2026', 'xpodrao-secure-jwt-token-secret-2026'];
const PORT = 3000;

interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

function verifyJwtToken(token: string): any | null {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e1) {
    for (const legacy of LEGACY_JWT_SECRETS) {
      try {
        return jwt.verify(token, legacy);
      } catch (e2) {
        // continue trying
      }
    }
  }
  return null;
}

// Authentication middleware
function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const user = verifyJwtToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
  }
  req.user = user;
  next();
}

// Optional auth middleware (for routes accessible by guests or logged-in users)
function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    const user = verifyJwtToken(token);
    if (user) {
      req.user = user;
    }
  }
  next();
}

async function startServer() {
  await initDatabase();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // --- HEALTH CHECK ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // --- AUTHENTICATION ROUTES ---
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, email, password, preferredGenres, preferredLanguages } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }

      if (username.length < 3) {
        return res.status(400).json({ error: 'Nome de usuário deve ter no mínimo 3 caracteres.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
      }

      // Check existing
      const existingUser = queryOne('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
      if (existingUser) {
        return res.status(400).json({ error: 'Nome de usuário ou e-mail já está em uso.' });
      }

      const id = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const passwordHash = await bcrypt.hash(password, 10);
      const now = new Date().toISOString();

      run(
        'INSERT INTO users (id, username, email, password_hash, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)',
        [id, username, email, passwordHash, now, now]
      );

      // Create profile
      const genresStr = JSON.stringify(preferredGenres || []);
      const langsStr = JSON.stringify(preferredLanguages || ['pt-br', 'en']);
      run(
        'INSERT INTO profiles (user_id, display_name, preferred_genres, preferred_languages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, username, genresStr, langsStr, now, now]
      );

      // Create settings
      run(
        'INSERT INTO settings (user_id, reader_mode, reading_direction, page_fit, auto_download_next, keep_downloads, theme, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, 'webtoon', 'ltr', 'width', 0, 1, 'dark', now]
      );

      const token = jwt.sign({ id, username, email }, JWT_SECRET, { expiresIn: '30d' });

      res.status(201).json({
        user: { id, username, email },
        profile: {
          displayName: username,
          preferredGenres: preferredGenres || [],
          preferredLanguages: preferredLanguages || ['pt-br', 'en'],
        },
        token,
      });
    } catch (err: any) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Erro interno ao registrar conta.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { login, password } = req.body;
      if (!login || !password) {
        return res.status(400).json({ error: 'Informe usuário/e-mail e senha.' });
      }

      const user = queryOne(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [login, login]
      );

      if (!user) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const now = new Date().toISOString();
      run('UPDATE users SET last_login = ? WHERE id = ?', [now, user.id]);

      const profile = queryOne('SELECT * FROM profiles WHERE user_id = ?', [user.id]);
      const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

      res.json({
        user: { id: user.id, username: user.username, email: user.email },
        profile: profile ? {
          displayName: profile.display_name,
          avatar: profile.avatar,
          preferredGenres: JSON.parse(profile.preferred_genres || '[]'),
          preferredLanguages: JSON.parse(profile.preferred_languages || '["pt-br", "en"]'),
        } : null,
        token,
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Erro interno ao autenticar.' });
    }
  });

  app.post('/api/auth/guest', async (req, res) => {
    try {
      const id = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const username = 'Leitor_' + Math.floor(1000 + Math.random() * 9000);
      const email = `${username.toLowerCase()}@local.guest`;
      const now = new Date().toISOString();

      run(
        'INSERT INTO users (id, username, email, password_hash, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)',
        [id, username, email, 'guest', now, now]
      );

      run(
        'INSERT INTO profiles (user_id, display_name, preferred_genres, preferred_languages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, username, '[]', '["pt-br", "en"]', now, now]
      );

      run(
        'INSERT INTO settings (user_id, reader_mode, reading_direction, page_fit, auto_download_next, keep_downloads, theme, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, 'webtoon', 'ltr', 'width', 0, 1, 'dark', now]
      );

      const token = jwt.sign({ id, username, email, isGuest: true }, JWT_SECRET, { expiresIn: '30d' });

      res.json({
        user: { id, username, email, isGuest: true },
        profile: {
          displayName: username,
          preferredGenres: [],
          preferredLanguages: ['pt-br', 'en'],
        },
        token,
      });
    } catch (err: any) {
      console.error('Guest creation error:', err);
      res.status(500).json({ error: 'Erro ao criar sessão de visitante.' });
    }
  });

  app.get('/api/auth/me', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const user = queryOne('SELECT id, username, email, created_at FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const profile = queryOne('SELECT * FROM profiles WHERE user_id = ?', [userId]);
    const settings = queryOne('SELECT * FROM settings WHERE user_id = ?', [userId]);

    res.json({
      user,
      profile: profile ? {
        displayName: profile.display_name,
        avatar: profile.avatar,
        preferredGenres: JSON.parse(profile.preferred_genres || '[]'),
        preferredLanguages: JSON.parse(profile.preferred_languages || '["pt-br", "en"]'),
      } : null,
      settings: settings || null,
    });
  });

  // --- USER PREFERENCES & SETTINGS ---
  app.put('/api/user/preferences', authenticateToken, (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { preferredGenres, preferredLanguages, displayName } = req.body;
      const now = new Date().toISOString();

      const genresStr = JSON.stringify(preferredGenres || []);
      const langsStr = JSON.stringify(preferredLanguages || ['pt-br', 'en']);

      run(
        `INSERT INTO profiles (user_id, display_name, preferred_genres, preferred_languages, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
         display_name = COALESCE(?, display_name),
         preferred_genres = ?,
         preferred_languages = ?,
         updated_at = ?`,
        [
          userId,
          displayName || req.user!.username,
          genresStr,
          langsStr,
          now,
          now,
          displayName ?? null,
          genresStr,
          langsStr,
          now,
        ]
      );

      res.json({ success: true });
    } catch (err: any) {
      console.error('Preferences update error:', err);
      res.status(500).json({ error: 'Erro ao atualizar preferências.' });
    }
  });

  app.get('/api/user/settings', authenticateToken, (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const settings = queryOne('SELECT * FROM settings WHERE user_id = ?', [userId]);
      res.json(settings || {
        reader_mode: 'webtoon',
        reading_direction: 'ltr',
        page_fit: 'width',
        theme: 'dark',
        preload_network: 'all',
        max_cache_mb: 500,
        cache_retention_chapters: 3,
      });
    } catch (err: any) {
      console.error('Get settings error:', err);
      res.json({
        reader_mode: 'webtoon',
        reading_direction: 'ltr',
        page_fit: 'width',
        theme: 'dark',
        preload_network: 'all',
        max_cache_mb: 500,
        cache_retention_chapters: 3,
      });
    }
  });

  app.put('/api/user/settings', authenticateToken, (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const {
        reader_mode,
        reading_direction,
        page_fit,
        auto_download_next,
        keep_downloads,
        theme,
        preload_network,
        max_cache_mb,
        cache_retention_chapters,
      } = req.body;
      const now = new Date().toISOString();

      run(
        `INSERT INTO settings (user_id, reader_mode, reading_direction, page_fit, auto_download_next, keep_downloads, theme, preload_network, max_cache_mb, cache_retention_chapters, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
         reader_mode = COALESCE(?, reader_mode),
         reading_direction = COALESCE(?, reading_direction),
         page_fit = COALESCE(?, page_fit),
         auto_download_next = COALESCE(?, auto_download_next),
         keep_downloads = COALESCE(?, keep_downloads),
         theme = COALESCE(?, theme),
         preload_network = COALESCE(?, preload_network),
         max_cache_mb = COALESCE(?, max_cache_mb),
         cache_retention_chapters = COALESCE(?, cache_retention_chapters),
         updated_at = ?`,
        [
          userId,
          reader_mode || 'webtoon',
          reading_direction || 'ltr',
          page_fit || 'width',
          auto_download_next ? 1 : 0,
          keep_downloads !== undefined ? (keep_downloads ? 1 : 0) : 1,
          theme || 'dark',
          preload_network || 'all',
          max_cache_mb || 500,
          cache_retention_chapters || 3,
          now,
          reader_mode ?? null,
          reading_direction ?? null,
          page_fit ?? null,
          auto_download_next !== undefined ? (auto_download_next ? 1 : 0) : null,
          keep_downloads !== undefined ? (keep_downloads ? 1 : 0) : null,
          theme ?? null,
          preload_network ?? null,
          max_cache_mb ?? null,
          cache_retention_chapters ?? null,
          now,
        ]
      );

      res.json({ success: true });
    } catch (err: any) {
      console.error('Settings update error:', err);
      res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
  });

  // --- LIBRARY ROUTES ---
  app.get('/api/user/library', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const items = queryAll('SELECT * FROM library WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
    res.json(items);
  });

  app.post('/api/user/library', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { mangaId, sourceId, title, coverUrl, author, artist, status, category, totalChapters } = req.body;

    if (!mangaId || !title) {
      return res.status(400).json({ error: 'ID do mangá e título são obrigatórios.' });
    }

    const id = 'lib_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    run(
      `INSERT INTO library (id, user_id, manga_id, source_id, title, cover_url, author, artist, status, category, total_chapters, unread_count, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(user_id, manga_id, source_id) DO UPDATE SET
       category = COALESCE(?, category),
       title = COALESCE(?, title),
       cover_url = COALESCE(?, cover_url),
       updated_at = ?`,
      [
        id,
        userId,
        mangaId,
        sourceId || 'mangadex',
        title,
        coverUrl || '',
        author || '',
        artist || '',
        status || 'ongoing',
        category || 'reading',
        totalChapters || 0,
        now,
        now,
        category,
        title,
        coverUrl,
        now,
      ]
    );

    res.json({ success: true, mangaId, category: category || 'reading' });
  });

  app.put('/api/user/library/:mangaId', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { mangaId } = req.params;
    const { category, status } = req.body;
    const now = new Date().toISOString();

    run(
      'UPDATE library SET category = COALESCE(?, category), status = COALESCE(?, status), updated_at = ? WHERE user_id = ? AND manga_id = ?',
      [category, status, now, userId, mangaId]
    );

    res.json({ success: true });
  });

  app.delete('/api/user/library/:mangaId', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { mangaId } = req.params;
    run('DELETE FROM library WHERE user_id = ? AND manga_id = ?', [userId, mangaId]);
    res.json({ success: true });
  });

  // --- READING PROGRESS & HISTORY ---
  app.get('/api/user/progress', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const progress = queryAll(
      'SELECT * FROM reading_progress WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );
    res.json(progress);
  });

  app.get('/api/user/progress/:mangaId', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { mangaId } = req.params;
    const item = queryOne(
      'SELECT * FROM reading_progress WHERE user_id = ? AND manga_id = ? ORDER BY updated_at DESC LIMIT 1',
      [userId, mangaId]
    );
    res.json(item || null);
  });

  app.post('/api/user/progress', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const {
      mangaId,
      chapterId,
      mangaTitle,
      chapterNumber,
      chapterTitle,
      coverUrl,
      currentPage,
      totalPages,
      isCompleted,
    } = req.body;

    if (!mangaId || !chapterId) {
      return res.status(400).json({ error: 'MangaId e ChapterId são obrigatórios.' });
    }

    const id = 'prog_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const histId = 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    const curPage = Math.max(1, parseInt(currentPage || 1, 10));
    const totPages = Math.max(1, parseInt(totalPages || 1, 10));
    const percentage = Math.min(100, Math.round((curPage / totPages) * 100));
    const completed = isCompleted ? 1 : percentage >= 95 ? 1 : 0;

    // Save/update progress
    run(
      `INSERT INTO reading_progress (id, user_id, manga_id, chapter_id, manga_title, chapter_number, chapter_title, current_page, total_pages, percentage, is_completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, manga_id, chapter_id) DO UPDATE SET
       current_page = ?,
       total_pages = ?,
       percentage = ?,
       is_completed = ?,
       updated_at = ?`,
      [
        id,
        userId,
        mangaId,
        chapterId,
        mangaTitle || '',
        chapterNumber || '1',
        chapterTitle || '',
        curPage,
        totPages,
        percentage,
        completed,
        now,
        curPage,
        totPages,
        percentage,
        completed,
        now,
      ]
    );

    // Save/update reading history
    run(
      `INSERT INTO reading_history (id, user_id, manga_id, chapter_id, manga_title, chapter_number, chapter_title, cover_url, page, total_pages, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, manga_id, chapter_id) DO UPDATE SET
       page = ?,
       total_pages = ?,
       read_at = ?`,
      [
        histId,
        userId,
        mangaId,
        chapterId,
        mangaTitle || '',
        chapterNumber || '1',
        chapterTitle || '',
        coverUrl || '',
        curPage,
        totPages,
        now,
        curPage,
        totPages,
        now,
      ]
    );

    res.json({ success: true, percentage, currentPage: curPage });
  });

  // Batch sync progress from offline queue
  app.post('/api/user/progress/sync', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { queue } = req.body; // array of progress objects
    if (!Array.isArray(queue)) {
      return res.status(400).json({ error: 'Queue must be an array' });
    }

    let syncedCount = 0;
    for (const item of queue) {
      if (!item.mangaId || !item.chapterId) continue;
      const id = 'prog_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const histId = 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const now = item.updatedAt || new Date().toISOString();
      const curPage = Math.max(1, parseInt(item.currentPage || 1, 10));
      const totPages = Math.max(1, parseInt(item.totalPages || 1, 10));
      const percentage = Math.min(100, Math.round((curPage / totPages) * 100));
      const completed = item.isCompleted ? 1 : percentage >= 95 ? 1 : 0;

      run(
        `INSERT INTO reading_progress (id, user_id, manga_id, chapter_id, manga_title, chapter_number, chapter_title, current_page, total_pages, percentage, is_completed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, manga_id, chapter_id) DO UPDATE SET
         current_page = ?,
         total_pages = ?,
         percentage = ?,
         is_completed = ?,
         updated_at = ?`,
        [
          id,
          userId,
          item.mangaId,
          item.chapterId,
          item.mangaTitle || '',
          item.chapterNumber || '1',
          item.chapterTitle || '',
          curPage,
          totPages,
          percentage,
          completed,
          now,
          curPage,
          totPages,
          percentage,
          completed,
          now,
        ]
      );

      run(
        `INSERT INTO reading_history (id, user_id, manga_id, chapter_id, manga_title, chapter_number, chapter_title, cover_url, page, total_pages, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, manga_id, chapter_id) DO UPDATE SET
         page = ?,
         total_pages = ?,
         read_at = ?`,
        [
          histId,
          userId,
          item.mangaId,
          item.chapterId,
          item.mangaTitle || '',
          item.chapterNumber || '1',
          item.chapterTitle || '',
          item.coverUrl || '',
          curPage,
          totPages,
          now,
          curPage,
          totPages,
          now,
        ]
      );
      syncedCount++;
    }

    res.json({ success: true, syncedCount });
  });

  app.get('/api/user/history', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const history = queryAll(
      'SELECT * FROM reading_history WHERE user_id = ? ORDER BY read_at DESC LIMIT 100',
      [userId]
    );
    res.json(history);
  });

  app.delete('/api/user/history/:chapterId', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { chapterId } = req.params;
    run('DELETE FROM reading_history WHERE user_id = ? AND chapter_id = ?', [userId, chapterId]);
    res.json({ success: true });
  });

  app.delete('/api/user/history', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    run('DELETE FROM reading_history WHERE user_id = ?', [userId]);
    res.json({ success: true });
  });

  // --- DOWNLOAD METADATA SYNC ---
  app.get('/api/user/downloads', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const downloads = queryAll(
      'SELECT * FROM download_metadata WHERE user_id = ? ORDER BY downloaded_at DESC',
      [userId]
    );
    res.json(downloads);
  });

  app.post('/api/user/downloads', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const {
      mangaId,
      chapterId,
      chapterNumber,
      chapterTitle,
      mangaTitle,
      coverUrl,
      pageCount,
      sizeBytes,
    } = req.body;

    const id = 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    run(
      `INSERT INTO download_metadata (id, user_id, manga_id, chapter_id, chapter_number, chapter_title, manga_title, cover_url, page_count, size_bytes, status, downloaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
       ON CONFLICT(user_id, manga_id, chapter_id) DO UPDATE SET
       page_count = ?,
       size_bytes = ?,
       downloaded_at = ?`,
      [
        id,
        userId,
        mangaId,
        chapterId,
        chapterNumber || '1',
        chapterTitle || '',
        mangaTitle || '',
        coverUrl || '',
        pageCount || 0,
        sizeBytes || 0,
        now,
        pageCount || 0,
        sizeBytes || 0,
        now,
      ]
    );

    res.json({ success: true });
  });

  app.delete('/api/user/downloads/:chapterId', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { chapterId } = req.params;
    run('DELETE FROM download_metadata WHERE user_id = ? AND chapter_id = ?', [userId, chapterId]);
    res.json({ success: true });
  });

  // --- EXTENSIONS & SOURCES CATALOG ---
  app.get('/api/extensions/catalog', async (req, res) => {
    try {
      const catalog = await getKeiyoushiExtensions();
      res.json(catalog || []);
    } catch (err: any) {
      console.error('Catalog route error:', err);
      res.json([]);
    }
  });

  app.get('/api/user/sources', authenticateToken, (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const sources = queryAll('SELECT * FROM user_sources WHERE user_id = ?', [userId]);
      res.json(sources || []);
    } catch (err: any) {
      console.error('User sources error:', err);
      res.json([]);
    }
  });

  app.put('/api/user/sources', authenticateToken, (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { sourceId, sourceName, isEnabled, lang, iconUrl } = req.body;

      const id = 'src_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      run(
        `INSERT INTO user_sources (id, user_id, source_id, source_name, is_enabled, lang, icon_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, source_id) DO UPDATE SET
         is_enabled = ?,
         source_name = COALESCE(?, source_name)`,
        [id, userId, sourceId, sourceName || sourceId, isEnabled ? 1 : 0, lang || 'pt-br', iconUrl || '', isEnabled ? 1 : 0, sourceName]
      );

      res.json({ success: true });
    } catch (err: any) {
      console.error('Save source error:', err);
      res.status(500).json({ error: 'Erro ao salvar fonte.' });
    }
  });

  // --- REAL MANGA SEARCH & DISCOVERY (MangaFire Priority + Fallback) ---
  app.get('/api/manga/search', async (req, res) => {
    try {
      const query = (req.query.q as string) || '';
      const genres = req.query.genres ? (req.query.genres as string).split(',') : undefined;
      const languages = req.query.lang ? (req.query.lang as string).split(',') : ['pt-br', 'pt', 'en'];
      const limit = parseInt((req.query.limit as string) || '24', 10);
      const offset = parseInt((req.query.offset as string) || '0', 10);

      const result = await searchMangaAggregated(query, {
        genres,
        languages,
        limit,
        offset,
      });

      res.json(result || { results: [], total: 0 });
    } catch (err: any) {
      console.error('Search error:', err);
      res.json({ results: [], total: 0, error: 'Erro ao buscar mangás.' });
    }
  });

  app.get('/api/manga/recommendations', optionalAuth, async (req: AuthRequest, res) => {
    try {
      let genres: string[] = [];
      if (req.user) {
        const profile = queryOne('SELECT preferred_genres FROM profiles WHERE user_id = ?', [req.user.id]);
        if (profile && profile.preferred_genres) {
          try {
            genres = JSON.parse(profile.preferred_genres);
          } catch (e) {}
        }
      } else if (req.query.genres) {
        genres = (req.query.genres as string).split(',');
      }

      const recs = await getRecommendations(genres, ['pt-br', 'pt', 'en']);
      res.json(recs || []);
    } catch (err: any) {
      console.error('Error fetching recommendations in route:', err);
      res.json([]);
    }
  });

  app.get('/api/manga/updates', optionalAuth, async (req: AuthRequest, res) => {
    try {
      let mangaIds: string[] = [];
      if (req.user) {
        const library = queryAll('SELECT manga_id FROM library WHERE user_id = ?', [req.user.id]);
        mangaIds = library.map((l: any) => l.manga_id);
      } else if (req.query.ids) {
        mangaIds = (req.query.ids as string).split(',');
      }

      if (mangaIds.length === 0) {
        return res.json([]);
      }

      const updates = await checkMangaUpdates(mangaIds, ['pt-br', 'pt', 'en']);
      res.json(updates || []);
    } catch (err: any) {
      console.error('Error checking updates in route:', err);
      res.json([]);
    }
  });

  app.get('/api/manga/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const details = await getMangaDetails(id);
      if (!details) {
        return res.status(404).json({ error: 'Mangá não encontrado na fonte.' });
      }
      res.json(details);
    } catch (err: any) {
      console.error(`Error in getMangaDetails for ${req.params.id}:`, err);
      res.status(404).json({ error: 'Erro ao obter detalhes do mangá.' });
    }
  });

  app.get('/api/manga/:id/feed', async (req, res) => {
    try {
      const { id } = req.params;
      const lang = req.query.lang ? (req.query.lang as string).split(',') : ['pt-br', 'pt', 'en', 'es'];
      const chapters = await getMangaChapters(id, lang);
      res.json(chapters || []);
    } catch (err: any) {
      console.error(`Error in getMangaChapters for ${req.params.id}:`, err);
      res.json([]);
    }
  });

  app.get('/api/chapter/:id/pages', async (req, res) => {
    try {
      const { id } = req.params;
      const pagesData = await getChapterPages(id);
      if (!pagesData || !pagesData.pages || pagesData.pages.length === 0) {
        return res.status(404).json({ error: 'Não foi possível carregar as páginas do capítulo.' });
      }
      res.json(pagesData);
    } catch (err: any) {
      console.error(`Error in getChapterPages for ${req.params.id}:`, err);
      res.status(404).json({ error: 'Erro ao obter páginas do capítulo.' });
    }
  });

  // --- CROSS-DEVICE FULL STATE SYNC (Laptop <-> Phone Continuity) ---
  app.get('/api/sync/pull', authenticateToken, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const library = queryAll('SELECT * FROM library WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
    const progress = queryAll('SELECT * FROM reading_progress WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
    const history = queryAll('SELECT * FROM reading_history WHERE user_id = ? ORDER BY read_at DESC LIMIT 100', [userId]);
    const favorites = queryAll('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    const settings = queryOne('SELECT * FROM settings WHERE user_id = ?', [userId]);

    res.json({
      library,
      progress,
      history,
      favorites,
      settings,
      syncedAt: new Date().toISOString(),
    });
  });

  // --- SOURCE ERROR AUDIT LOGS ---
  app.get('/api/sources/logs', authenticateToken, (req: AuthRequest, res) => {
    const logs = queryAll('SELECT * FROM source_error_logs ORDER BY created_at DESC LIMIT 50');
    res.json(logs);
  });

  // --- IMAGE PROXY (Bypasses CORS & Hotlinking, enables IndexedDB offline cache) ---
  app.get('/api/proxy/image', async (req, res) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send('Missing url parameter');
    }

    try {
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 15000,
        headers: {
          'User-Agent': 'XPodrao/1.0 (Mozilla/5.0)',
          Referer: 'https://mangadex.org/',
        },
      });

      const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7 days
      response.data.pipe(res);
    } catch (err: any) {
      res.status(502).send('Error loading image');
    }
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`X Podrão server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start X Podrão server:', err);
  process.exit(1);
});
