import React, { useState, useEffect, useMemo } from 'react';
import { ChapterItem, LibraryCategory, MangaItem, ReadingProgress } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDownloads } from '../context/DownloadContext';
import {
  apiAddToLibrary,
  apiGetMangaChapters,
  apiGetMangaDetails,
  apiGetMangaProgress,
  apiRemoveFromLibrary,
  getProxiedImageUrl,
} from '../services/api';
import { cacheMangaForOffline, getCachedManga, getDownloadedChaptersForManga } from '../services/storage';
import {
  X,
  BookOpen,
  Play,
  Bookmark,
  BookmarkCheck,
  Download,
  CheckCircle,
  Clock,
  Layers,
  CheckSquare,
  Square,
  Share2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

interface MangaDetailModalProps {
  mangaId: string;
  initialData?: MangaItem;
  onClose: () => void;
  onStartReading: (chapter: ChapterItem, manga: MangaItem) => void;
}

export const MangaDetailModal: React.FC<MangaDetailModalProps> = ({
  mangaId,
  initialData,
  onClose,
  onStartReading,
}) => {
  const { user, isOnline } = useAuth();
  const {
    queueChapter,
    queueBatchChapters,
    isChapterDownloaded,
    removeDownloadedChapter,
    isDownloading,
  } = useDownloads();

  const [manga, setManga] = useState<MangaItem | null>(initialData || null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [inLibrary, setInLibrary] = useState<boolean>(!!initialData?.category);
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory>(
    initialData?.category || 'reading'
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(true);
  const [selectedLang, setSelectedLang] = useState<string>('all');
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());

  // Load Manga Details & Chapters
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setLoadingChapters(true);

      // 1. Fetch details
      let details: MangaItem | null = null;
      try {
        if (isOnline) {
          details = await apiGetMangaDetails(mangaId);
          if (details) {
            await cacheMangaForOffline(details);
          }
        } else {
          details = (await getCachedManga(mangaId)) || initialData || null;
        }
      } catch (detailsErr) {
        console.warn('Could not fetch online manga details, falling back to cache/initialData:', detailsErr);
        details = (await getCachedManga(mangaId)) || initialData || null;
      }

      if (isMounted) {
        if (details) {
          setManga(details);
        } else if (initialData) {
          setManga(initialData);
        }
        setLoading(false);
      }

      // 2. Fetch reading progress (safely isolated)
      if (user && isOnline) {
        try {
          const prog = await apiGetMangaProgress(mangaId);
          if (isMounted && prog) setProgress(prog);
        } catch (progErr) {
          // Non-critical, ignore
        }
      }

      // 3. Fetch chapters
      try {
        if (isOnline) {
          const chList = await apiGetMangaChapters(mangaId, ['pt-br', 'pt', 'en', 'es']);
          if (isMounted) {
            setChapters(chList || []);
          }
        } else {
          // If offline, list any downloaded chapters from IndexedDB
          const dlChapters = await getDownloadedChaptersForManga(mangaId);
          if (isMounted && dlChapters.length > 0) {
            setChapters(
              dlChapters.map((dl) => ({
                id: dl.chapterId,
                mangaId: dl.mangaId,
                chapter: dl.chapterNumber,
                title: dl.chapterTitle || `Capítulo ${dl.chapterNumber}`,
                volume: null,
                language: 'pt-br',
                publishAt: dl.downloadedAt,
                pages: dl.pages.length,
                sourceId: 'offline',
                sourceName: 'Baixado (Offline)',
              }))
            );
          }
        }
      } catch (chaptersErr) {
        console.warn('Error fetching chapters list:', chaptersErr);
        if (isMounted) {
          setChapters([]);
        }
      } finally {
        if (isMounted) {
          setLoadingChapters(false);
        }
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [mangaId, isOnline, user, initialData]);

  // Filter chapters by language if selected
  const filteredChapters = useMemo(() => {
    if (selectedLang === 'all') return chapters;
    return chapters.filter((c) => c.language === selectedLang);
  }, [chapters, selectedLang]);

  // Group chapters by volume
  const groupedChapters = useMemo(() => {
    const map: Record<string, ChapterItem[]> = {};
    for (const ch of filteredChapters) {
      const volKey = ch.volume ? `Volume ${ch.volume}` : 'Sem Volume';
      if (!map[volKey]) map[volKey] = [];
      map[volKey].push(ch);
    }
    return map;
  }, [filteredChapters]);

  const hasVolumes = Object.keys(groupedChapters).some((k) => k !== 'Sem Volume');

  // Handle Add to Library
  const handleToggleLibrary = async (category: LibraryCategory = 'reading') => {
    if (!manga) return;
    try {
      if (inLibrary && category === libraryCategory) {
        await apiRemoveFromLibrary(manga.id);
        setInLibrary(false);
      } else {
        await apiAddToLibrary({
          mangaId: manga.id,
          sourceId: manga.sourceId || 'mangadex',
          title: manga.title,
          coverUrl: manga.coverUrl,
          author: manga.author,
          artist: manga.artist,
          status: manga.status,
          category,
          totalChapters: chapters.length,
        });
        setInLibrary(true);
        setLibraryCategory(category);
      }
    } catch (e) {
      console.error('Error modifying library:', e);
    }
  };

  // Toggle chapter selection
  const toggleSelectChapter = (chId: string) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chId)) next.delete(chId);
      else next.add(chId);
      return next;
    });
  };

  const selectAllChapters = () => {
    if (selectedChapterIds.size === filteredChapters.length) {
      setSelectedChapterIds(new Set());
    } else {
      setSelectedChapterIds(new Set(filteredChapters.map((c) => c.id)));
    }
  };

  // Batch download selected
  const handleDownloadSelected = () => {
    if (!manga || selectedChapterIds.size === 0) return;
    const chaptersToDownload = filteredChapters
      .filter((c) => selectedChapterIds.has(c.id))
      .map((c) => ({
        id: c.id,
        mangaId: manga.id,
        chapterNumber: c.chapter,
        chapterTitle: c.title || undefined,
        mangaTitle: manga.title,
        coverUrl: manga.coverUrl,
      }));

    queueBatchChapters(chaptersToDownload);
    setIsSelecting(false);
    setSelectedChapterIds(new Set());
  };

  // Volume download
  const handleDownloadVolume = (volumeName: string, volChapters: ChapterItem[]) => {
    if (!manga) return;
    const items = volChapters.map((c) => ({
      id: c.id,
      mangaId: manga.id,
      chapterNumber: c.chapter,
      chapterTitle: c.title || undefined,
      mangaTitle: manga.title,
      coverUrl: manga.coverUrl,
    }));
    queueBatchChapters(items);
  };

  return (
    <div id="manga-detail-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div id="manga-detail-modal-container" className="w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-neutral-100 animate-in fade-in zoom-in-95 duration-200">
        {/* MODAL TOP BAR */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80 sticky top-0 z-20">
          <div className="flex items-center space-x-2">
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
              manga?.sourceId === 'mangafire'
                ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                : 'bg-red-950/80 border-red-800 text-red-300'
            }`}>
              {manga?.sourceName || (manga?.sourceId === 'mangafire' ? 'MangaFire' : 'MangaDex (Fallback)')}
            </span>
            {manga?.hasFallback && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-medium">
                Multi-fonte ativa
              </span>
            )}
            {manga?.status && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium">
                {manga.status === 'completed' ? 'Completo' : 'Em lançamento'}
              </span>
            )}
          </div>
          <button
            id="close-manga-detail-btn"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1">
          {/* HEADER: Cover, Metadata, Actions */}
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Cover */}
            <div className="w-36 sm:w-48 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl bg-neutral-950 border border-neutral-800 shrink-0 mx-auto sm:mx-0 relative">
              {manga?.coverUrl ? (
                <img
                  src={getProxiedImageUrl(manga.coverUrl)}
                  alt={manga.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600">
                  <BookOpen className="w-10 h-10" />
                </div>
              )}
            </div>

            {/* Info & Action Buttons */}
            <div className="space-y-4 flex-1">
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                  {manga?.title || 'Carregando mangá...'}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400 mt-2">
                  {manga?.author && (
                    <span>
                      <strong className="text-neutral-300">Autor:</strong> {manga.author}
                    </span>
                  )}
                  {manga?.artist && manga.artist !== manga.author && (
                    <span>
                      <strong className="text-neutral-300">Arte:</strong> {manga.artist}
                    </span>
                  )}
                  {manga?.year && (
                    <span>
                      <strong className="text-neutral-300">Ano:</strong> {manga.year}
                    </span>
                  )}
                </div>
              </div>

              {/* Genres & Multi-Source Badge */}
              <div className="space-y-2">
                {manga?.genres && manga.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {manga.genres.map((g) => (
                      <span
                        key={g}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-neutral-950 border border-neutral-800 text-neutral-300"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Multi-source Aggregation Tag */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-950/40 border border-rose-800/60 text-rose-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Multi-Fonte Unificada {manga?.sources && manga.sources.length > 1 ? `(${manga.sources.map(s => s.sourceName).join(' + ')})` : '(MangaFire + MangaDex)'}
                  </span>
                  {chapters.some(c => c.isGapFiller) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-950/50 border border-amber-800/60 text-amber-300">
                      ✨ Lacunas Preenchidas ({chapters.filter(c => c.isGapFiller).length})
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {/* Read Button */}
                {chapters.length > 0 ? (
                  <button
                    id="manga-primary-read-btn"
                    type="button"
                    onClick={() => {
                      const targetChapter = progress
                        ? chapters.find((c) => c.id === progress.chapterId) || chapters[chapters.length - 1]
                        : chapters[chapters.length - 1]; // Start from oldest/first chapter or resume
                      if (manga && targetChapter) onStartReading(targetChapter, manga);
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-semibold rounded-xl text-xs sm:text-sm transition shadow-lg shadow-rose-900/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    {progress
                      ? `Continuar (Cap. ${progress.chapterNumber})`
                      : `Começar a Ler (${chapters[chapters.length - 1]?.chapter ? `Cap. ${chapters[chapters.length - 1].chapter}` : 'Primeiro'})`}
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-6 py-3 bg-neutral-800 text-neutral-500 font-semibold rounded-xl text-xs sm:text-sm cursor-not-allowed"
                  >
                    Nenhum capítulo disponível
                  </button>
                )}

                {/* Library Toggle */}
                <div className="relative inline-block">
                  <button
                    id="manga-toggle-library-btn"
                    type="button"
                    onClick={() => handleToggleLibrary(libraryCategory)}
                    className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold border transition flex items-center gap-2 cursor-pointer ${
                      inLibrary
                        ? 'bg-rose-950/60 border-rose-600 text-rose-300 shadow-sm'
                        : 'bg-neutral-800/80 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                    }`}
                  >
                    {inLibrary ? (
                      <>
                        <BookmarkCheck className="w-4 h-4 text-rose-400" />
                        <span>Na Biblioteca</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4" />
                        <span>Salvar na Biblioteca</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Synopsis / Description */}
          {manga?.description && (
            <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-2xl p-4 sm:p-5 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Sinopse</h3>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-line pr-2">
                {manga.description}
              </p>
            </div>
          )}

          {/* CHAPTERS SECTION */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-800 pt-5">
              <div className="flex items-center space-x-3">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-rose-500" />
                  Capítulos Disponíveis
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-medium">
                    {filteredChapters.length}
                  </span>
                </h3>
              </div>

              {/* Actions & Language filter */}
              <div className="flex items-center space-x-2">
                {filteredChapters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelecting(!isSelecting);
                      setSelectedChapterIds(new Set());
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      isSelecting
                        ? 'bg-rose-950 border-rose-600 text-rose-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {isSelecting ? 'Cancelar Seleção' : 'Selecionar Vários'}
                  </button>
                )}
              </div>
            </div>

            {/* Batch Selection Action Bar */}
            {isSelecting && (
              <div className="bg-neutral-950 border border-rose-800/60 rounded-xl p-3 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={selectAllChapters}
                    className="text-rose-400 font-semibold hover:underline cursor-pointer"
                  >
                    {selectedChapterIds.size === filteredChapters.length
                      ? 'Desmarcar Todos'
                      : 'Selecionar Todos'}
                  </button>
                  <span className="text-neutral-400">
                    {selectedChapterIds.size} {selectedChapterIds.size === 1 ? 'capítulo selecionado' : 'capítulos selecionados'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={selectedChapterIds.size === 0}
                  onClick={handleDownloadSelected}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar Selecionados ({selectedChapterIds.size})
                </button>
              </div>
            )}

            {/* CHAPTERS LIST */}
            {loadingChapters ? (
              <div className="py-12 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                Carregando lista real de capítulos...
              </div>
            ) : filteredChapters.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-xs bg-neutral-950/40 rounded-2xl border border-neutral-800">
                Nenhum capítulo disponível para este mangá no momento.
              </div>
            ) : (
              <div className="space-y-4">
                {(Object.entries(groupedChapters) as [string, ChapterItem[]][]).map(([volumeName, volChapters]) => (
                  <div key={volumeName} className="space-y-2">
                    {hasVolumes && (
                      <div className="flex items-center justify-between bg-neutral-950/90 px-4 py-2 rounded-xl border border-neutral-800">
                        <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                          {volumeName} ({volChapters.length} caps)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownloadVolume(volumeName, volChapters)}
                          className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" /> Baixar Volume
                        </button>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {volChapters.map((ch) => {
                        const downloaded = isChapterDownloaded(ch.id);
                        const isCurrentRead = progress?.chapterId === ch.id;
                        const isSelected = selectedChapterIds.has(ch.id);

                        return (
                          <div
                            key={ch.id}
                            id={`chapter-row-${ch.id}`}
                            className={`flex items-center justify-between p-3 rounded-xl border transition ${
                              isCurrentRead
                                ? 'bg-rose-950/30 border-rose-800/80 text-white'
                                : 'bg-neutral-950/50 hover:bg-neutral-950 border-neutral-800/80 text-neutral-200'
                            }`}
                          >
                            {/* Left: Checkbox (if selecting) & Chapter Title */}
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              {isSelecting && (
                                <button
                                  type="button"
                                  onClick={() => toggleSelectChapter(ch.id)}
                                  className="text-rose-400 cursor-pointer"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4" />
                                  ) : (
                                    <Square className="w-4 h-4 text-neutral-500" />
                                  )}
                                </button>
                              )}

                              <div
                                onClick={() => {
                                  if (isSelecting) toggleSelectChapter(ch.id);
                                  else if (manga) onStartReading(ch, manga);
                                }}
                                className="cursor-pointer flex-1 min-w-0"
                              >
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                  <span className="font-bold text-xs sm:text-sm text-white">
                                    Capítulo {ch.chapter}
                                  </span>
                                  {ch.isGapFiller && (
                                    <span className="text-[10px] text-amber-300 font-semibold px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-800">
                                      ✨ Lacuna Preenchida
                                    </span>
                                  )}
                                  {ch.alternativeSources && ch.alternativeSources.length > 0 && (
                                    <span className="text-[10px] text-sky-400 font-medium px-1.5 py-0.2 rounded bg-sky-950/60 border border-sky-800/60">
                                      +{ch.alternativeSources.length} fonte(s)
                                    </span>
                                  )}
                                  {ch.language && (
                                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400">
                                      {ch.language}
                                    </span>
                                  )}
                                  {downloaded && (
                                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-0.5 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800">
                                      <CheckCircle className="w-2.5 h-2.5" /> Offline
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 text-[11px] text-neutral-400 mt-0.5">
                                  {ch.title && <span className="truncate">{ch.title}</span>}
                                  <span className="text-neutral-500">
                                    Fonte: {ch.sourceName || 'Padrão'}
                                  </span>
                                  {ch.scanlationGroup && (
                                    <span className="truncate text-neutral-500">
                                      • {ch.scanlationGroup}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center space-x-2 shrink-0">
                              {downloaded ? (
                                <button
                                  type="button"
                                  onClick={() => removeDownloadedChapter(ch.id)}
                                  title="Excluir download"
                                  className="p-2 rounded-lg bg-neutral-900 hover:bg-rose-950/50 text-neutral-400 hover:text-rose-400 border border-neutral-800 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (manga) {
                                      queueChapter({
                                        id: ch.id,
                                        mangaId: manga.id,
                                        chapterNumber: ch.chapter,
                                        chapterTitle: ch.title || undefined,
                                        mangaTitle: manga.title,
                                        coverUrl: manga.coverUrl,
                                      });
                                    }
                                  }}
                                  title="Baixar para ler offline"
                                  className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (manga) onStartReading(ch, manga);
                                }}
                                className="px-3 py-1.5 bg-rose-900/40 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-xs font-semibold border border-rose-800/60 transition cursor-pointer"
                              >
                                Ler
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
