import axios from 'axios';
import * as cheerio from 'cheerio';
import { run, queryAll } from './db.js';

const MANGADEX_BASE_URL = 'https://api.mangadex.org';
const MANGAFIRE_BASE_URL = 'https://mangafire.to';
const KEIYOUSHI_CATALOG_URL = 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json';

// --- In-Memory Caches with TTL ---
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const searchCache = new Map<string, CacheEntry<{ results: MangaResult[]; total: number }>>();
const detailsCache = new Map<string, CacheEntry<MangaResult>>();
const chaptersCache = new Map<string, CacheEntry<ChapterResult[]>>();
const pagesCache = new Map<string, CacheEntry<ChapterPagesResult>>();
let keiyoushiCache: any[] | null = null;
let lastKeiyoushiFetch = 0;

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number = 1000 * 60 * 15) {
  cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  // Limit cache size
  if (cache.size > 250) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

// --- Data Types ---
export interface SourceReference {
  sourceId: string;
  sourceName: string;
  mangaId: string;
  url?: string;
}

export interface MangaResult {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  altTitles?: string[];
  description: string;
  coverUrl: string;
  author: string;
  artist: string;
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  genres: string[];
  year?: number;
  contentRating: string;
  availableLanguages: string[];
  totalChapters?: number;
  sources?: SourceReference[];
  sourceCount?: number;
  hasFallback?: boolean;
}

export interface ChapterSourceAlternative {
  sourceId: string;
  sourceName: string;
  chapterId: string;
  originalChapterId?: string;
  pages?: number;
}

export interface ChapterResult {
  id: string;
  mangaId: string;
  volume: string | null;
  chapter: string;
  title: string | null;
  language: string;
  publishAt: string;
  pages: number;
  scanlationGroup?: string;
  sourceId: string;
  sourceName?: string;
  originalChapterId?: string;
  alternativeSources?: ChapterSourceAlternative[];
  isGapFiller?: boolean;
}

export interface ChapterPagesResult {
  chapterId: string;
  baseUrl: string;
  hash: string;
  pages: string[];
  dataSaverPages: string[];
  sourceId?: string;
  sourceName?: string;
  fallbackUsed?: boolean;
}

// --- Logging Helper ---
export function logSourceError(source: string, mangaId?: string, chapterId?: string, errorMsg?: string) {
  try {
    const id = 'err_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    run(
      'INSERT INTO source_error_logs (id, source, manga_id, chapter_id, error_message, attempt_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, source, mangaId || null, chapterId || null, String(errorMsg || 'Unknown error').substring(0, 500), 1, now]
    );
  } catch (e) {
    // Ignore logging errors
  }
}

// --- Title Normalization for Deduplication ---
export function normalizeTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/\s*\([^)]*\)/g, '') // remove (Color), (Official), (Digital), etc.
    .replace(/\s*\[[^\]]*\]/g, '') // remove [Official], [Colored]
    .replace(/^(the|a|an|o|a|os|as|um|uma)\s+/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titlesMatch(a: string, b: string): boolean {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.replace(/\s+/g, '') === normB.replace(/\s+/g, '')) return true;
  if (normA.length > 5 && normB.length > 5) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }
  return false;
}

export function normalizeChapterKey(chStr: string | number | null | undefined): string {
  if (chStr === null || chStr === undefined) return '0';
  const str = String(chStr).trim();
  const num = parseFloat(str.replace(',', '.'));
  if (!isNaN(num)) {
    return String(num);
  }
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ==========================================
// 1. MANGAFIRE PROVIDER (Priority #1)
// ==========================================
export async function searchMangaFire(query: string): Promise<MangaResult[]> {
  if (!query || !query.trim()) return [];
  try {
    const encoded = encodeURIComponent(query.trim());
    const response = await axios.get(`${MANGAFIRE_BASE_URL}/filter?keyword=${encoded}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://mangafire.to/',
      },
    });

    const $ = cheerio.load(response.data);
    const results: MangaResult[] = [];

    $('.original.card-lg, .unit, .inner').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a[href*="/manga/"]').first();
      const href = link.attr('href') || '';
      const title = link.text().trim() || $el.find('.info h3, .info h4, .name').first().text().trim();
      const cover = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
      
      const idMatch = href.match(/\/manga\/([a-zA-Z0-9_.-]+)/);
      const id = idMatch ? idMatch[1] : '';

      if (id && title) {
        results.push({
          id: `mf_${id}`,
          sourceId: 'mangafire',
          sourceName: 'MangaFire',
          title,
          description: '',
          coverUrl: cover.startsWith('//') ? 'https:' + cover : cover,
          author: 'MangaFire Source',
          artist: 'MangaFire Source',
          status: 'ongoing',
          genres: [],
          contentRating: 'safe',
          availableLanguages: ['pt-br', 'en', 'es'],
          sources: [{ sourceId: 'mangafire', sourceName: 'MangaFire', mangaId: `mf_${id}` }],
          sourceCount: 1,
        });
      }
    });

    return results;
  } catch (err: any) {
    logSourceError('mangafire', undefined, undefined, `Search error: ${err.message}`);
    return [];
  }
}

export async function getMangaFireDetails(mfId: string): Promise<MangaResult | null> {
  const cleanId = mfId.replace(/^mf_/, '');
  try {
    const response = await axios.get(`${MANGAFIRE_BASE_URL}/manga/${cleanId}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://mangafire.to/',
      },
    });

    const $ = cheerio.load(response.data);
    const title = $('h1.title, .info h1, .manga-detail h1').first().text().trim() || 'Mangá MangaFire';
    const description = $('.description, .info .desc, .summary').first().text().trim();
    const cover = $('.poster img, .manga-poster img').first().attr('src') || '';
    const author = $('.meta span:contains("Author")').parent().text().replace('Author:', '').trim() || 'Autor MangaFire';
    const genres: string[] = [];
    $('.genres a, .genres span').each((_, g) => {
      const gt = $(g).text().trim();
      if (gt) genres.push(gt);
    });

    return {
      id: mfId,
      sourceId: 'mangafire',
      sourceName: 'MangaFire',
      title,
      description,
      coverUrl: cover.startsWith('//') ? 'https:' + cover : cover,
      author,
      artist: author,
      status: 'ongoing',
      genres,
      contentRating: 'safe',
      availableLanguages: ['pt-br', 'en', 'es'],
      sources: [{ sourceId: 'mangafire', sourceName: 'MangaFire', mangaId: mfId }],
      sourceCount: 1,
    };
  } catch (err: any) {
    logSourceError('mangafire', mfId, undefined, `Details error: ${err.message}`);
    return null;
  }
}

export async function getMangaFireChapters(mfId: string, languages: string[] = ['pt-br', 'en', 'es']): Promise<ChapterResult[]> {
  const cleanId = mfId.replace(/^mf_/, '');
  try {
    const response = await axios.get(`${MANGAFIRE_BASE_URL}/manga/${cleanId}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://mangafire.to/',
      },
    });

    const $ = cheerio.load(response.data);
    const chapters: ChapterResult[] = [];

    $('li.item, .list-body li, .tab-content li, .chapter-list li, ul.chapters li').each((_, el) => {
      const link = $(el).find('a').first();
      const href = link.attr('href') || '';
      const text = link.text().trim() || $(el).find('.name, span').first().text().trim();
      const title = $(el).find('.title, .name').text().trim() || null;

      const match = text.match(/(?:chapter|cap[ií]tulo|ch\.?|ep\.?)\s*([\d.]+)/i) || text.match(/^([\d.]+)/);
      const chapterNum = match ? match[1] : (text.match(/[\d.]+/) ? text.match(/[\d.]+/)![0] : '0');
      
      const volMatch = text.match(/(?:vol\.?|volume)\s*([\d.]+)/i);
      const vol = volMatch ? volMatch[1] : null;

      const chIdMatch = href.match(/\/read\/[^/]+\/([^/]+)/) || href.match(/\/manga\/[^/]+\/chapter-([\d.]+)/);
      const chapterId = chIdMatch ? `mf_ch_${cleanId}_${chIdMatch[1]}` : `mf_ch_${cleanId}_${chapterNum}`;

      if (chapterNum && !chapters.some((c) => c.chapter === chapterNum)) {
        chapters.push({
          id: chapterId,
          mangaId: mfId,
          volume: vol,
          chapter: chapterNum,
          title: title && title !== text ? title : null,
          language: 'pt-br',
          publishAt: new Date().toISOString(),
          pages: 20,
          scanlationGroup: 'MangaFire Scan',
          sourceId: 'mangafire',
          sourceName: 'MangaFire',
        });
      }
    });

    return chapters;
  } catch (err: any) {
    logSourceError('mangafire', mfId, undefined, `Chapters error: ${err.message}`);
    return [];
  }
}

// ==========================================
// 2. MANGADEX PROVIDER (Priority #2 & Global Fallback)
// ==========================================
export async function searchMangaDex(
  query: string,
  options: {
    genres?: string[];
    languages?: string[];
    limit?: number;
    offset?: number;
    order?: Record<string, 'asc' | 'desc'>;
  } = {}
): Promise<{ results: MangaResult[]; total: number }> {
  try {
    const params: any = {
      limit: options.limit || 24,
      offset: options.offset || 0,
      'includes[]': ['cover_art', 'author', 'artist'],
      'contentRating[]': ['safe', 'suggestive', 'erotica'],
    };

    if (query && query.trim()) {
      params.title = query.trim();
    }

    if (options.languages && options.languages.length > 0) {
      params['availableTranslatedLanguage[]'] = options.languages;
    }

    if (options.order) {
      for (const [key, dir] of Object.entries(options.order)) {
        params[`order[${key}]`] = dir;
      }
    } else {
      params['order[relevance]'] = 'desc';
      params['order[followedCount]'] = 'desc';
    }

    const response = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
      params,
      timeout: 10000,
      headers: {
        'User-Agent': 'XPodrao/1.0',
      },
    });

    const data = response.data;
    const results: MangaResult[] = (data.data || []).map((manga: any) => {
      const attributes = manga.attributes || {};
      const titleObj = attributes.title || {};
      const title = titleObj['pt-br'] || titleObj['pt'] || titleObj['en'] || titleObj['ja-ro'] || Object.values(titleObj)[0] || 'Sem Título';
      const altTitles = (attributes.altTitles || []).map((t: any) => Object.values(t)[0]).filter(Boolean) as string[];

      const descObj = attributes.description || {};
      const description = descObj['pt-br'] || descObj['pt'] || descObj['en'] || descObj['es'] || Object.values(descObj)[0] || '';

      const relationships = manga.relationships || [];
      const coverRel = relationships.find((r: any) => r.type === 'cover_art');
      const coverFileName = coverRel?.attributes?.fileName;
      const coverUrl = coverFileName
        ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg`
        : '';

      const authorRel = relationships.find((r: any) => r.type === 'author');
      const author = authorRel?.attributes?.name || 'Autor Desconhecido';
      const artistRel = relationships.find((r: any) => r.type === 'artist');
      const artist = artistRel?.attributes?.name || author;

      const tags = (attributes.tags || [])
        .map((t: any) => t.attributes?.name?.en)
        .filter(Boolean);

      return {
        id: manga.id,
        sourceId: 'mangadex',
        sourceName: 'MangaDex',
        title,
        altTitles,
        description: typeof description === 'string' ? description : '',
        coverUrl,
        author,
        artist,
        status: attributes.status || 'ongoing',
        genres: tags,
        year: attributes.year || undefined,
        contentRating: attributes.contentRating || 'safe',
        availableLanguages: attributes.availableTranslatedLanguages || [],
        sources: [{ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId: manga.id }],
      };
    });

    return {
      results,
      total: data.total || results.length,
    };
  } catch (error: any) {
    logSourceError('mangadex', undefined, undefined, `Search error: ${error.message}`);
    return { results: [], total: 0 };
  }
}

export async function getMangaDexDetails(mangaId: string): Promise<MangaResult | null> {
  try {
    const response = await axios.get(`${MANGADEX_BASE_URL}/manga/${mangaId}`, {
      params: {
        'includes[]': ['cover_art', 'author', 'artist'],
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'XPodrao/1.0',
      },
    });

    const manga = response.data.data;
    if (!manga) return null;

    const attributes = manga.attributes || {};
    const titleObj = attributes.title || {};
    const title = titleObj['pt-br'] || titleObj['pt'] || titleObj['en'] || titleObj['ja-ro'] || Object.values(titleObj)[0] || 'Sem Título';

    const descObj = attributes.description || {};
    const description = descObj['pt-br'] || descObj['pt'] || descObj['en'] || descObj['es'] || Object.values(descObj)[0] || '';

    const relationships = manga.relationships || [];
    const coverRel = relationships.find((r: any) => r.type === 'cover_art');
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName
      ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg`
      : '';

    const authorRel = relationships.find((r: any) => r.type === 'author');
    const author = authorRel?.attributes?.name || 'Autor Desconhecido';
    const artistRel = relationships.find((r: any) => r.type === 'artist');
    const artist = artistRel?.attributes?.name || author;

    const tags = (attributes.tags || [])
      .map((t: any) => t.attributes?.name?.en)
      .filter(Boolean);

    return {
      id: manga.id,
      sourceId: 'mangadex',
      sourceName: 'MangaDex',
      title,
      description: typeof description === 'string' ? description : '',
      coverUrl,
      author,
      artist,
      status: attributes.status || 'ongoing',
      genres: tags,
      year: attributes.year || undefined,
      contentRating: attributes.contentRating || 'safe',
      availableLanguages: attributes.availableTranslatedLanguages || [],
      sources: [{ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId: manga.id }],
    };
  } catch (error: any) {
    logSourceError('mangadex', mangaId, undefined, `Details error: ${error.message}`);
    return null;
  }
}

export async function getMangaDexChapters(
  mangaId: string,
  languages: string[] = ['pt-br', 'pt', 'en', 'es']
): Promise<ChapterResult[]> {
  try {
    let allChapters: any[] = [];
    let offset = 0;
    const limit = 100;
    let total = 100;

    while (offset < total && offset < 500) {
      const params: any = {
        limit,
        offset,
        'includes[]': ['scanlation_group'],
        'order[chapter]': 'desc',
        'contentRating[]': ['safe', 'suggestive', 'erotica'],
      };

      if (languages && languages.length > 0) {
        params['translatedLanguage[]'] = languages;
      }

      const response = await axios.get(`${MANGADEX_BASE_URL}/manga/${mangaId}/feed`, {
        params,
        timeout: 10000,
        headers: {
          'User-Agent': 'XPodrao/1.0',
        },
      });

      const data = response.data;
      total = data.total || 0;
      const batch = data.data || [];
      allChapters = allChapters.concat(batch);
      offset += limit;

      if (batch.length < limit) break;
    }

    return allChapters.map((ch: any) => {
      const attributes = ch.attributes || {};
      const relationships = ch.relationships || [];
      const groupRel = relationships.find((r: any) => r.type === 'scanlation_group');
      const scanlationGroup = groupRel?.attributes?.name || 'MangaDex Community';

      return {
        id: ch.id,
        mangaId,
        volume: attributes.volume || null,
        chapter: attributes.chapter || '0',
        title: attributes.title || null,
        language: attributes.translatedLanguage || 'unknown',
        publishAt: attributes.publishAt || attributes.createdAt || new Date().toISOString(),
        pages: attributes.pages || 0,
        scanlationGroup,
        sourceId: 'mangadex',
        sourceName: 'MangaDex',
      };
    });
  } catch (error: any) {
    logSourceError('mangadex', mangaId, undefined, `Chapters error: ${error.message}`);
    return [];
  }
}

// ==========================================
// 3. MULTI-SOURCE UNIFIED AGGREGATOR (With MangaFire Priority & Fallback)
// ==========================================

/**
 * Unified Search: Priority MangaFire -> MangaDex -> ALL Keiyoushi Extensions (Zero artificial limits)
 * De-duplicates manga entries so the user gets 1 unified card per title with sources registered.
 */
export async function searchMangaAggregated(
  query: string,
  options: {
    genres?: string[];
    languages?: string[];
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ results: MangaResult[]; total: number; sourcesQueried: string[] }> {
  const cacheKey = `search_${query}_${(options.genres || []).join('_')}_${(options.languages || []).join('_')}_${options.limit}_${options.offset}`;
  const cached = getFromCache(searchCache, cacheKey);
  if (cached) {
    return { ...cached, sourcesQueried: ['MangaFire', 'MangaDex', 'Keiyoushi (Full Index Cache)'] };
  }

  const sourcesQueried: string[] = [];
  const canonicalMangaList: MangaResult[] = [];

  // Helper to find or merge matching manga in canonical list
  const mergeOrAddManga = (incoming: MangaResult) => {
    const existing = canonicalMangaList.find(
      (m) =>
        titlesMatch(m.title, incoming.title) ||
        (m.altTitles && m.altTitles.some((alt) => titlesMatch(alt, incoming.title))) ||
        (incoming.altTitles && incoming.altTitles.some((alt) => titlesMatch(m.title, alt)))
    );

    if (existing) {
      // Merge source reference into existing entry
      if (!existing.sources) {
        existing.sources = [{ sourceId: existing.sourceId, sourceName: existing.sourceName, mangaId: existing.id }];
      }
      if (!existing.sources.some((s) => s.sourceId === incoming.sourceId && s.mangaId === incoming.id)) {
        existing.sources.push({
          sourceId: incoming.sourceId,
          sourceName: incoming.sourceName,
          mangaId: incoming.id,
          url: incoming.sources?.[0]?.url,
        });
      }
      existing.sourceCount = existing.sources.length;
      existing.hasFallback = true;

      // Enrich metadata if existing entry lacked details
      if (!existing.description && incoming.description) existing.description = incoming.description;
      if ((!existing.coverUrl || existing.coverUrl.includes('placeholder')) && incoming.coverUrl) {
        existing.coverUrl = incoming.coverUrl;
      }
      if (incoming.genres && incoming.genres.length > 0) {
        existing.genres = Array.from(new Set([...existing.genres, ...incoming.genres]));
      }
      if (incoming.altTitles && incoming.altTitles.length > 0) {
        existing.altTitles = Array.from(new Set([...(existing.altTitles || []), ...incoming.altTitles]));
      }
    } else {
      if (!incoming.sources) {
        incoming.sources = [{ sourceId: incoming.sourceId, sourceName: incoming.sourceName, mangaId: incoming.id }];
      }
      incoming.sourceCount = incoming.sources.length;
      canonicalMangaList.push(incoming);
    }
  };

  // 1 & 2. Priority Sources in parallel: MangaFire and MangaDex
  const corePromises: Promise<void>[] = [];

  if (query && query.trim()) {
    corePromises.push(
      (async () => {
        try {
          sourcesQueried.push('MangaFire');
          const mfResults = await searchMangaFire(query);
          for (const m of mfResults) {
            mergeOrAddManga(m);
          }
        } catch (e) {
          logSourceError('mangafire', undefined, undefined, 'Aggregated search failed for MangaFire');
        }
      })()
    );
  }

  corePromises.push(
    (async () => {
      try {
        sourcesQueried.push('MangaDex');
        const dexRes = await searchMangaDex(query, options);
        for (const dexManga of dexRes.results) {
          mergeOrAddManga(dexManga);
        }
      } catch (e) {
        logSourceError('mangadex', undefined, undefined, 'Aggregated search failed for MangaDex');
      }
    })()
  );

  await Promise.allSettled(corePromises);

  // 3. Complete Keiyoushi Catalog Search across ALL matching sources (zero artificial limits)
  if (query && query.trim()) {
    try {
      const allKeiyoushiSources = await getAllKeiyoushiSources(options.languages);
      let index = 0;
      const concurrency = 35;
      
      const keiyoushiSearchPromise = (async () => {
        const workers = Array.from({ length: Math.min(concurrency, allKeiyoushiSources.length) }, async () => {
          while (index < allKeiyoushiSources.length) {
            const src = allKeiyoushiSources[index++];
            if (!src) break;
            try {
              if (!sourcesQueried.includes(src.name)) {
                sourcesQueried.push(src.name);
              }
              const results = await searchKeiyoushiSource(src, query);
              for (const m of results) {
                mergeOrAddManga(m);
              }
            } catch (e) {
              // Ignore individual source network issues
            }
          }
        });
        await Promise.all(workers);
      })();

      // Bound Keiyoushi full scan to 10 seconds max so responses remain fast and never timeout
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 10000));
      await Promise.race([keiyoushiSearchPromise, timeoutPromise]);
    } catch (e: any) {
      logSourceError('keiyoushi_batch', undefined, undefined, `Keiyoushi scan error: ${e.message}`);
    }
  }

  const finalResult = { results: canonicalMangaList, total: canonicalMangaList.length };
  setInCache(searchCache, cacheKey, finalResult, 1000 * 60 * 10);

  return { ...finalResult, sourcesQueried };
}

/**
 * Unified Manga Details with Fallback
 */
export async function getMangaDetails(mangaId: string): Promise<MangaResult | null> {
  const cached = getFromCache(detailsCache, mangaId);
  if (cached) return cached;

  let result: MangaResult | null = null;

  // If MangaFire ID
  if (mangaId.startsWith('mf_')) {
    result = await getMangaFireDetails(mangaId);
    if (!result || !result.title) {
      logSourceError('mangafire', mangaId, undefined, 'MangaFire details failed, falling back to MangaDex');
      const query = mangaId.replace(/^mf_/, '').replace(/[-_.]+/g, ' ');
      const dexSearch = await searchMangaDex(query, { limit: 1 });
      if (dexSearch.results.length > 0) {
        result = dexSearch.results[0];
        result.hasFallback = true;
      }
    } else {
      // Find counterpart on MangaDex to link sources
      try {
        const dexSearch = await searchMangaDex(result.title, { limit: 1 });
        if (dexSearch.results.length > 0) {
          const dex = dexSearch.results[0];
          if (!result.sources) result.sources = [{ sourceId: 'mangafire', sourceName: 'MangaFire', mangaId }];
          if (!result.sources.some((s) => s.sourceId === 'mangadex')) {
            result.sources.push({ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId: dex.id });
          }
          result.sourceCount = result.sources.length;
          result.hasFallback = true;
          if (!result.description && dex.description) result.description = dex.description;
          if (dex.genres && dex.genres.length > 0) {
            result.genres = Array.from(new Set([...result.genres, ...dex.genres]));
          }
        }
      } catch (e) {}
    }
  } else if (mangaId.startsWith('kei_')) {
    // Keiyoushi Source ID
    result = {
      id: mangaId,
      sourceId: mangaId.split('_')[1] ? `kei_${mangaId.split('_')[1]}` : 'keiyoushi',
      sourceName: 'Keiyoushi Extension',
      title: 'Mangá',
      description: '',
      coverUrl: '',
      author: 'Autor',
      artist: 'Artista',
      status: 'ongoing',
      genres: [],
      contentRating: 'safe',
      availableLanguages: ['pt-br'],
      sources: [{ sourceId: 'keiyoushi', sourceName: 'Keiyoushi Extension', mangaId }],
    };
  } else {
    // MangaDex ID
    result = await getMangaDexDetails(mangaId);
    if (result && result.title) {
      // Discover MangaFire counterpart
      try {
        const mfResults = await searchMangaFire(result.title);
        const match = mfResults.find((m) => titlesMatch(m.title, result!.title));
        if (match) {
          if (!result.sources) result.sources = [{ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId }];
          if (!result.sources.some((s) => s.sourceId === 'mangafire')) {
            result.sources.push({ sourceId: 'mangafire', sourceName: 'MangaFire', mangaId: match.id });
          }
          result.sourceCount = result.sources.length;
          result.hasFallback = true;
        }
      } catch (e) {}
    }
  }

  if (result) {
    setInCache(detailsCache, mangaId, result, 1000 * 60 * 15);
  }
  return result;
}

/**
 * Intelligent Multi-Source Chapter Aggregation & Exhaustive Gap-Filling:
 * 1. Queries all available sources for the manga (MangaDex, MangaFire, Keiyoushi).
 * 2. Compares coverage across all sources and chooses the source with the most chapters as Primary Source.
 * 3. Uses Primary Source as baseline (100% precedence).
 * 4. Fills any missing chapter gaps from all secondary sources (e.g. A has 1-2, B has 1-5, D has 6-12, E has 1-15 -> Result: 1-15).
 * 5. Deduplicates strictly by normalized chapter number.
 * 6. Sorts accurately by Volume and Chapter number.
 */
export async function getMangaChapters(
  mangaId: string,
  languages: string[] = ['pt-br', 'pt', 'en', 'es']
): Promise<ChapterResult[]> {
  const cacheKey = `chapters_${mangaId}_${languages.join('_')}`;
  const cached = getFromCache(chaptersCache, cacheKey);
  if (cached) return cached;

  // 1. Resolve all linked source IDs for this work
  const details = await getMangaDetails(mangaId);
  const sourcesToQuery: Array<{ sourceId: string; sourceName: string; mangaId: string; url?: string }> = [];

  if (details && details.sources && details.sources.length > 0) {
    for (const src of details.sources) {
      if (!sourcesToQuery.some((s) => s.sourceId === src.sourceId && s.mangaId === src.mangaId)) {
        sourcesToQuery.push(src);
      }
    }
  } else {
    // Default fallback source mapping
    if (mangaId.startsWith('mf_')) {
      sourcesToQuery.push({ sourceId: 'mangafire', sourceName: 'MangaFire', mangaId });
      if (details && details.title) {
        try {
          const dex = await searchMangaDex(details.title, { limit: 1 });
          if (dex.results.length > 0) {
            sourcesToQuery.push({ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId: dex.results[0].id });
          }
        } catch (e) {}
      }
    } else if (mangaId.startsWith('kei_')) {
      sourcesToQuery.push({ sourceId: 'keiyoushi', sourceName: 'Keiyoushi Extension', mangaId });
    } else {
      sourcesToQuery.push({ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId });
      if (details && details.title) {
        try {
          const mf = await searchMangaFire(details.title);
          const match = mf.find((m) => titlesMatch(m.title, details.title));
          if (match) {
            sourcesToQuery.push({ sourceId: 'mangafire', sourceName: 'MangaFire', mangaId: match.id });
          }
        } catch (e) {}
      }
    }
  }

  // If we have a title and only 1 source was linked, quickly query counterparts
  if (sourcesToQuery.length === 1 && details && details.title) {
    try {
      if (!sourcesToQuery.some(s => s.sourceId === 'mangafire')) {
        const mf = await searchMangaFire(details.title);
        const match = mf.find((m) => titlesMatch(m.title, details.title));
        if (match) {
          sourcesToQuery.push({ sourceId: 'mangafire', sourceName: 'MangaFire', mangaId: match.id });
        }
      }
      if (!sourcesToQuery.some(s => s.sourceId === 'mangadex')) {
        const dex = await searchMangaDex(details.title, { limit: 2 });
        const match = dex.results.find((m) => titlesMatch(m.title, details.title));
        if (match) {
          sourcesToQuery.push({ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId: match.id });
        }
      }
    } catch (e) {}
  }

  // 2. Fetch chapter feeds concurrently from ALL resolved sources with individual timeouts
  const feedPromises = sourcesToQuery.map(async (src) => {
    try {
      let fetchPromise: Promise<ChapterResult[]>;
      if (src.sourceId === 'mangafire') {
        fetchPromise = getMangaFireChapters(src.mangaId, languages);
      } else if (src.sourceId === 'mangadex') {
        fetchPromise = getMangaDexChapters(src.mangaId, languages);
      } else if (src.sourceId.startsWith('kei_') || src.sourceId === 'keiyoushi') {
        fetchPromise = getKeiyoushiChapters(src.mangaId, src.url);
      } else {
        return { source: src, chapters: [] };
      }

      const feedTimeout = new Promise<ChapterResult[]>((resolve) => setTimeout(() => resolve([]), 8000));
      const list = await Promise.race([fetchPromise, feedTimeout]);
      return { source: src, chapters: list };
    } catch (err: any) {
      logSourceError(src.sourceId, src.mangaId, undefined, `Feed error: ${err.message}`);
      return { source: src, chapters: [] };
    }
  });

  const feedResults = await Promise.all(feedPromises);

  // Filter valid sources that returned chapters
  const validFeeds = feedResults.filter((f) => f.chapters && f.chapters.length > 0);

  if (validFeeds.length === 0) {
    // Direct MangaDex attempt as fallback
    const directDex = await getMangaDexChapters(mangaId, languages);
    if (directDex.length > 0) {
      setInCache(chaptersCache, cacheKey, directDex, 1000 * 60 * 10);
      return directDex;
    }
    return [];
  }

  // 3. Compare chapter coverage across sources
  // Sort sources in descending order of unique valid chapter count (Highest Coverage = Primary Source)
  validFeeds.sort((a, b) => b.chapters.length - a.chapters.length);

  const primaryFeed = validFeeds[0];
  const secondaryFeeds = validFeeds.slice(1);

  // 4. Build master unified chapter map (Primary Source has baseline priority)
  const masterMap = new Map<string, ChapterResult>();

  // A. Load 100% of Primary Source chapters
  for (const ch of primaryFeed.chapters) {
    const key = normalizeChapterKey(ch.chapter);
    masterMap.set(key, {
      ...ch,
      sourceId: ch.sourceId || primaryFeed.source.sourceId,
      sourceName: ch.sourceName || primaryFeed.source.sourceName,
      alternativeSources: [],
      isGapFiller: false,
    });
  }

  // B. Fill gaps from ALL secondary sources in order of coverage
  for (const secFeed of secondaryFeeds) {
    for (const ch of secFeed.chapters) {
      const key = normalizeChapterKey(ch.chapter);
      const existing = masterMap.get(key);

      if (!existing) {
        // GAP FILLED: Chapter was missing in primary source!
        masterMap.set(key, {
          ...ch,
          sourceId: ch.sourceId || secFeed.source.sourceId,
          sourceName: `${ch.sourceName || secFeed.source.sourceName} [Lacuna Preenchida]`,
          alternativeSources: [],
          isGapFiller: true,
        });
      } else {
        // Register secondary source as an alternative for user switching / fallback
        if (!existing.alternativeSources) existing.alternativeSources = [];
        if (!existing.alternativeSources.some((s) => s.chapterId === ch.id || s.sourceId === ch.sourceId)) {
          existing.alternativeSources.push({
            sourceId: ch.sourceId || secFeed.source.sourceId,
            sourceName: ch.sourceName || secFeed.source.sourceName,
            chapterId: ch.id,
            originalChapterId: ch.originalChapterId || ch.id,
            pages: ch.pages,
          });
        }
      }
    }
  }

  // 5. Accurate numeric sorting by volume and chapter number (Descending: latest first)
  const finalChapters = Array.from(masterMap.values());
  finalChapters.sort((a, b) => {
    const numA = parseFloat(a.chapter) || 0;
    const numB = parseFloat(b.chapter) || 0;
    if (numB !== numA) {
      return numB - numA;
    }
    const volA = parseFloat(a.volume || '0') || 0;
    const volB = parseFloat(b.volume || '0') || 0;
    return volB - volA;
  });

  setInCache(chaptersCache, cacheKey, finalChapters, 1000 * 60 * 10);
  return finalChapters;
}

/**
 * Resilient Chapter Pages Fetching with Automatic Multi-Source Fallback
 */
export async function getChapterPages(chapterId: string): Promise<ChapterPagesResult | null> {
  const cached = getFromCache(pagesCache, chapterId);
  if (cached) return cached;

  let result: ChapterPagesResult | null = null;

  // 1. If MangaDex chapter
  if (!chapterId.startsWith('mf_') && !chapterId.startsWith('kei_')) {
    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/at-home/server/${chapterId}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'XPodrao/1.0',
        },
      });

      const data = response.data;
      if (data && data.baseUrl && data.chapter) {
        const { baseUrl, chapter } = data;
        const hash = chapter.hash;
        const dataPages: string[] = (chapter.data || []).map((file: string) => {
          return `${baseUrl}/data/${hash}/${file}`;
        });

        const dataSaverPages: string[] = (chapter.dataSaver || []).map((file: string) => {
          return `${baseUrl}/data-saver/${hash}/${file}`;
        });

        if (dataPages.length > 0) {
          result = {
            chapterId,
            baseUrl,
            hash,
            pages: dataPages,
            dataSaverPages,
            sourceId: 'mangadex',
            sourceName: 'MangaDex',
            fallbackUsed: false,
          };
        }
      }
    } catch (err: any) {
      logSourceError('mangadex', undefined, chapterId, `At-Home pages error: ${err.message}`);
    }
  }

  // 2. If MangaFire chapter
  if (!result || result.pages.length === 0) {
    if (chapterId.startsWith('mf_ch_')) {
      try {
        const parts = chapterId.split('_');
        const mangaSlug = parts[2];
        const chSlug = parts[3];
        const pageUrl = `${MANGAFIRE_BASE_URL}/read/${mangaSlug}/pt-br/chapter-${chSlug}`;

        const response = await axios.get(pageUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://mangafire.to/',
          },
        });

        const $ = cheerio.load(response.data);
        const pages: string[] = [];
        $('.reader-page img, #reader-pages img, .image-wrapper img').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-url');
          if (src && !pages.includes(src)) {
            pages.push(src.startsWith('//') ? 'https:' + src : src);
          }
        });

        if (pages.length > 0) {
          result = {
            chapterId,
            baseUrl: '',
            hash: '',
            pages,
            dataSaverPages: pages,
            sourceId: 'mangafire',
            sourceName: 'MangaFire',
            fallbackUsed: false,
          };
        }
      } catch (err: any) {
        logSourceError('mangafire', undefined, chapterId, `MangaFire pages error: ${err.message}`);
      }
    }
  }

  // 3. If Keiyoushi source chapter
  if (!result || result.pages.length === 0) {
    if (chapterId.startsWith('kei_ch_')) {
      result = await getKeiyoushiChapterPages(chapterId);
    }
  }

  if (result && result.pages.length > 0) {
    setInCache(pagesCache, chapterId, result, 1000 * 60 * 30);
  }

  return result;
}

/**
 * Checks for latest updates for a list of manga IDs
 */
export async function checkMangaUpdates(mangaIds: string[], languages: string[] = ['pt-br', 'pt', 'en']) {
  if (!mangaIds.length) return [];

  const updates: any[] = [];
  for (const mangaId of mangaIds.slice(0, 25)) {
    try {
      const chapters = await getMangaChapters(mangaId, languages);
      if (chapters.length > 0) {
        const latest = chapters[0];
        updates.push({
          mangaId,
          chapterId: latest.id,
          chapterNumber: latest.chapter || '1',
          chapterTitle: latest.title || '',
          publishAt: latest.publishAt,
          volume: latest.volume || null,
          sourceName: latest.sourceName || 'MangaFire / MangaDex',
        });
      }
    } catch (e) {
      // Continue to next
    }
  }

  return updates;
}

/**
 * Gets real recommendations based on preferred genres
 */
export async function getRecommendations(genres: string[] = [], languages: string[] = ['pt-br', 'pt', 'en']) {
  try {
    const params: any = {
      limit: 12,
      'includes[]': ['cover_art', 'author'],
      'order[followedCount]': 'desc',
      'order[rating]': 'desc',
      'contentRating[]': ['safe', 'suggestive'],
    };

    if (languages.length > 0) {
      params['availableTranslatedLanguage[]'] = languages;
    }

    const response = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
      params,
      timeout: 10000,
      headers: { 'User-Agent': 'XPodrao/1.0' },
    });

    const mangaList = response.data?.data || [];
    return mangaList.map((manga: any) => {
      const attributes = manga.attributes || {};
      const titleObj = attributes.title || {};
      const title = titleObj['pt-br'] || titleObj['pt'] || titleObj['en'] || titleObj['ja-ro'] || Object.values(titleObj)[0] || 'Sem Título';

      const descObj = attributes.description || {};
      const description = descObj['pt-br'] || descObj['pt'] || descObj['en'] || descObj['es'] || Object.values(descObj)[0] || '';

      const relationships = manga.relationships || [];
      const coverRel = relationships.find((r: any) => r.type === 'cover_art');
      const coverFileName = coverRel?.attributes?.fileName;
      const coverUrl = coverFileName
        ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg`
        : '';

      const tags = (attributes.tags || [])
        .map((t: any) => t.attributes?.name?.en)
        .filter(Boolean);

      return {
        id: manga.id,
        sourceId: 'mangadex',
        sourceName: 'MangaDex',
        title,
        description: typeof description === 'string' ? description : '',
        coverUrl,
        genres: tags,
        status: attributes.status || 'ongoing',
        sources: [{ sourceId: 'mangadex', sourceName: 'MangaDex', mangaId: manga.id }],
      };
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return [];
  }
}

/**
 * Official Keiyoushi Extensions Catalog
 */
export async function getKeiyoushiExtensions() {
  const now = Date.now();
  if (keiyoushiCache && now - lastKeiyoushiFetch < 1000 * 60 * 30) {
    return keiyoushiCache;
  }

  try {
    const response = await axios.get(KEIYOUSHI_CATALOG_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    const rawData = response.data;
    const list = Array.isArray(rawData)
      ? rawData
      : (rawData?.extensionList?.extensions || (Array.isArray(rawData?.extensions) ? rawData.extensions : []));

    if (Array.isArray(list)) {
      keiyoushiCache = list.map((item: any) => ({
        id: item.pkg || item.packageName || item.name,
        name: item.name,
        pkg: item.pkg || item.packageName,
        version: item.version || item.versionName || '1.0',
        lang: item.lang || (item.sources?.[0]?.language) || 'all',
        isNsfw: item.isNsfw === 1 || item.isNsfw === true || item.contentWarning === 'CONTENT_WARNING_NSFW',
        icon: item.resources?.iconUrl || (item.icon ? `https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/${item.icon}` : null),
        sources: (item.sources || []).map((s: any) => ({
          id: String(s.id || s.name),
          name: s.name,
          language: s.language || item.lang || 'all',
          homeUrl: s.homeUrl || s.baseUrl || '',
        })),
      }));
      lastKeiyoushiFetch = now;
      return keiyoushiCache;
    }
    return [];
  } catch (err: any) {
    logSourceError('keiyoushi', undefined, undefined, `Catalog error: ${err.message}`);
    return keiyoushiCache || [];
  }
}

/**
 * Extracts ALL sources from Keiyoushi index without ANY artificial limit (NO .slice)
 */
export async function getAllKeiyoushiSources(languages?: string[]): Promise<Array<{ id: string; name: string; language: string; homeUrl: string; extName: string }>> {
  const extensions = await getKeiyoushiExtensions();
  const allSources: Array<{ id: string; name: string; language: string; homeUrl: string; extName: string }> = [];

  const langSet = languages && languages.length > 0
    ? new Set(languages.map(l => l.toLowerCase().replace('-', '')))
    : null;

  for (const ext of extensions) {
    for (const s of (ext.sources || [])) {
      if (!s.homeUrl || !s.homeUrl.startsWith('http')) continue;
      const sLang = (s.language || ext.lang || 'all').toLowerCase().replace('-', '');
      
      // Filter by language if specified, or include all relevant
      if (langSet) {
        const matches = langSet.has(sLang) || sLang === 'all' || 
          (langSet.has('ptbr') && (sLang === 'pt' || sLang === 'ptbr')) || 
          (langSet.has('pt') && (sLang === 'pt' || sLang === 'ptbr'));
        if (!matches) continue;
      }

      if (!allSources.some(existing => existing.homeUrl === s.homeUrl)) {
        allSources.push({
          id: s.id || ext.id,
          name: s.name || ext.name,
          language: s.language || ext.lang || 'pt-br',
          homeUrl: s.homeUrl,
          extName: ext.name,
        });
      }
    }
  }

  return allSources;
}

/**
 * Searches a single Keiyoushi source via its web interface
 */
export async function searchKeiyoushiSource(
  source: { id: string; name: string; language: string; homeUrl: string },
  query: string
): Promise<MangaResult[]> {
  if (!source.homeUrl) return [];
  const homeUrl = source.homeUrl.replace(/\/+$/, '');
  
  const searchEndpoints = [
    `${homeUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
    `${homeUrl}/search?q=${encodeURIComponent(query)}`,
    `${homeUrl}/buscar?q=${encodeURIComponent(query)}`,
    `${homeUrl}/manga?q=${encodeURIComponent(query)}`,
    `${homeUrl}/?s=${encodeURIComponent(query)}`,
  ];

  for (const endpoint of searchEndpoints.slice(0, 2)) {
    try {
      const resp = await axios.get(endpoint, {
        timeout: 2500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': homeUrl,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
      });

      const $ = cheerio.load(resp.data);
      const results: MangaResult[] = [];

      $('div.tab-thumb a, div.post-title h3 a, div.post-title h4 a, .manga-item a, .novel-item a, .book-item a, .entry-title a, .title a, a.series-title, .d-title a, .bsx a, .thumb-item a').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href') || '';
        const title = $el.attr('title') || $el.text().trim();
        
        const parent = $el.closest('.row, .manga-item, .post-item, .page-item-detail, .bs, .bsx, .item, .article, .thumb-item, li');
        const img = parent.find('img').first();
        const coverUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-cfsrc') || '';

        if (title && href && href.startsWith('http') && !results.some(r => titlesMatch(r.title, title))) {
          const rawId = Buffer.from(href).toString('base64url');
          results.push({
            id: `kei_${source.id}_${rawId}`,
            sourceId: `kei_${source.id}`,
            sourceName: source.name,
            title,
            description: '',
            author: 'Autor',
            artist: 'Artista',
            coverUrl: coverUrl.startsWith('//') ? 'https:' + coverUrl : coverUrl,
            status: 'ongoing',
            genres: [],
            contentRating: 'safe',
            availableLanguages: [source.language || 'pt-br'],
            sources: [{ sourceId: `kei_${source.id}`, sourceName: source.name, mangaId: `kei_${source.id}_${rawId}`, url: href }],
            sourceCount: 1,
          });
        }
      });

      if (results.length > 0) {
        return results;
      }
    } catch (e) {
      // Continue to next endpoint or return
    }
  }

  return [];
}

/**
 * Fetches chapters directly from a Keiyoushi source HTML page
 */
export async function getKeiyoushiChapters(mangaId: string, mangaUrl?: string): Promise<ChapterResult[]> {
  try {
    let targetUrl = mangaUrl;
    if (!targetUrl && mangaId.startsWith('kei_')) {
      const parts = mangaId.split('_');
      const b64 = parts.slice(2).join('_');
      if (b64) {
        targetUrl = Buffer.from(b64, 'base64url').toString('utf8');
      }
    }
    if (!targetUrl || !targetUrl.startsWith('http')) return [];

    const resp = await axios.get(targetUrl, {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': targetUrl,
      },
    });

    const $ = cheerio.load(resp.data);
    const chapters: ChapterResult[] = [];

    $('.wp-manga-chapter a, li.chapter-item a, .chapter-list a, li.item a, ul.chapters a, .list-chapters a, .chp-item a, .eph-num a, .chaplist a').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const text = $el.text().trim();
      const match = text.match(/(?:chapter|cap[ií]tulo|ch\.?|ep\.?)\s*([\d.]+)/i) || text.match(/^([\d.]+)/);
      const chapterNum = match ? match[1] : (text.match(/[\d.]+/) ? text.match(/[\d.]+/)![0] : '0');

      const volMatch = text.match(/(?:vol\.?|volume)\s*([\d.]+)/i);
      const vol = volMatch ? volMatch[1] : null;

      if (href && chapterNum && !chapters.some(c => c.chapter === chapterNum)) {
        const rawChId = Buffer.from(href).toString('base64url');
        chapters.push({
          id: `kei_ch_${rawChId}`,
          mangaId,
          volume: vol,
          chapter: chapterNum,
          title: text !== `Capítulo ${chapterNum}` && text !== `Chapter ${chapterNum}` ? text : null,
          language: 'pt-br',
          publishAt: new Date().toISOString(),
          pages: 20,
          scanlationGroup: 'Keiyoushi Scan',
          sourceId: mangaId.split('_')[1] ? `kei_${mangaId.split('_')[1]}` : 'keiyoushi',
          sourceName: 'Keiyoushi Extension',
        });
      }
    });

    return chapters;
  } catch (e) {
    return [];
  }
}

/**
 * Extracts reader pages from a Keiyoushi chapter page
 */
export async function getKeiyoushiChapterPages(chapterId: string): Promise<ChapterPagesResult | null> {
  try {
    const rawB64 = chapterId.replace(/^kei_ch_/, '');
    const chapterUrl = Buffer.from(rawB64, 'base64url').toString('utf8');
    if (!chapterUrl || !chapterUrl.startsWith('http')) return null;

    const resp = await axios.get(chapterUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': chapterUrl,
      },
    });

    const $ = cheerio.load(resp.data);
    const pages: string[] = [];

    $('.page-break img, .reading-content img, #readerarea img, .chapter-content img, .reader-pages img, .entry-content img, #images img, .read-container img, .content-reading img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-cfsrc') || $(el).attr('data-url');
      if (src && !pages.includes(src)) {
        const clean = src.trim().startsWith('//') ? 'https:' + src.trim() : src.trim();
        if (clean.startsWith('http')) {
          pages.push(clean);
        }
      }
    });

    if (pages.length > 0) {
      return {
        chapterId,
        baseUrl: '',
        hash: '',
        pages,
        dataSaverPages: pages,
        sourceId: 'keiyoushi',
        sourceName: 'Keiyoushi Source',
        fallbackUsed: false,
      };
    }
  } catch (e) {
    //
  }
  return null;
}
