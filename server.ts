import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';
import {
  searchMangaFire,
  getDiscoverMangas,
  getMangaDetails,
  getMangaChapters,
  getChapterPages,
} from './server/mangaService.js';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // --- HEALTH CHECK ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), source: 'MangaFire' });
  });

  // --- MANGA SEARCH (ETAPA A & B) ---
  app.get('/api/manga/search', async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const limit = parseInt((req.query.limit as string) || '24', 10);
      const result = await searchMangaFire(q, limit);
      res.json(result);
    } catch (err: any) {
      console.error('Search route error:', err);
      res.json({ results: [], total: 0 });
    }
  });

  // --- DISCOVER / TRENDING MANGAFIRE ---
  app.get('/api/manga/discover', async (req, res) => {
    try {
      const data = await getDiscoverMangas();
      res.json(data);
    } catch (err: any) {
      console.error('Discover route error:', err);
      res.json({ popular: [], latest: [] });
    }
  });

  // --- RECOMMENDATIONS ---
  app.get('/api/manga/recommendations', async (req, res) => {
    try {
      const data = await getDiscoverMangas();
      res.json(data.popular || []);
    } catch (err) {
      res.json([]);
    }
  });

  // --- MANGA DETAILS (ETAPA B) ---
  app.get('/api/manga/:id', async (req, res) => {
    try {
      const manga = await getMangaDetails(req.params.id);
      if (!manga) {
        return res.status(404).json({ error: 'Mangá não encontrado.' });
      }
      res.json(manga);
    } catch (err: any) {
      console.error('Get manga details error:', err);
      res.status(500).json({ error: 'Erro ao buscar detalhes do mangá.' });
    }
  });

  // --- MANGA CHAPTERS FEED ---
  app.get('/api/manga/:id/chapters', async (req, res) => {
    try {
      const chapters = await getMangaChapters(req.params.id);
      res.json({
        chapters,
        meta: {
          primarySource: 'MangaFire',
          totalChapters: chapters.length,
          sourcesCount: 1,
          gapsFilledCount: 0,
        },
      });
    } catch (err: any) {
      console.error('Get chapters error:', err);
      res.json({ chapters: [], meta: { totalChapters: 0, primarySource: 'MangaFire' } });
    }
  });

  // --- CHAPTER PAGES ---
  app.get('/api/chapter/:id/pages', async (req, res) => {
    try {
      const data = await getChapterPages(req.params.id);
      res.json(data);
    } catch (err: any) {
      console.error('Get pages error:', err);
      res.json({ chapterId: req.params.id, pages: [], total: 0 });
    }
  });

  // --- IMAGE PROXY (To bypass CORS & Hotlink Protections on manga covers/pages) ---
  app.get('/api/proxy/image', async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).send('Missing url');
      }

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'Referer': 'https://mangafire.to/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(response.data);
    } catch (err) {
      res.status(404).send('Image fetch failed');
    }
  });

  // Vite middleware for development
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
    console.log(`X Podrão Backend Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
});
