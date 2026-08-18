import React from 'react';
import { useDownloads } from '../context/DownloadContext';
import { DownloadedChapter, MangaItem, ChapterItem } from '../types';
import { getProxiedImageUrl } from '../services/api';
import { Download, Trash2, Play, HardDrive, AlertCircle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';

interface DownloadsViewProps {
  onStartReading: (chapter: ChapterItem, manga: MangaItem) => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({ onStartReading }) => {
  const {
    queue,
    downloadedChapters,
    storageStats,
    removeDownloadedChapter,
    isDownloading,
  } = useDownloads();

  const downloadedList: DownloadedChapter[] = Array.from(downloadedChapters.values());

  // Group downloaded chapters by manga
  const groupedByManga = downloadedList.reduce<
    Record<string, { mangaId: string; mangaTitle: string; coverUrl?: string; chapters: DownloadedChapter[] }>
  >((acc, ch: DownloadedChapter) => {
    if (!acc[ch.mangaId]) {
      acc[ch.mangaId] = {
        mangaId: ch.mangaId,
        mangaTitle: ch.mangaTitle,
        coverUrl: ch.coverUrl,
        chapters: [],
      };
    }
    acc[ch.mangaId].chapters.push(ch);
    return acc;
  }, {});

  const mangaGroups = Object.values(groupedByManga);

  return (
    <div id="downloads-view-container" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-6 animate-in fade-in duration-150">
      {/* Title & Storage Metric Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-rose-500" />
            Downloads & Conteúdo Offline
          </h2>
          <p className="text-xs text-neutral-400">
            Capítulos salvos localmente para ler sem qualquer necessidade de conexão com a internet
          </p>
        </div>

        {/* Storage usage badge */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 flex items-center gap-4 text-xs shrink-0">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-rose-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-neutral-400 text-[11px] font-medium">Espaço Utilizado</div>
            <div className="text-white font-bold text-sm">
              {storageStats.formatted}{' '}
              <span className="text-neutral-400 font-normal text-xs">
                ({storageStats.chapterCount} {storageStats.chapterCount === 1 ? 'capítulo' : 'capítulos'})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE QUEUE */}
      {queue.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-rose-500 animate-spin" />
            Fila de Downloads ({queue.length})
          </h3>

          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 flex items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-rose-400 shrink-0">
                    {item.status === 'downloading' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-neutral-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-white truncate">{item.mangaTitle}</h4>
                    <p className="text-neutral-400 text-[11px]">
                      Capítulo {item.chapterNumber} •{' '}
                      {item.status === 'downloading'
                        ? `Baixando página ${item.downloadedPages} de ${item.totalPages || '?'}`
                        : 'Aguardando na fila'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  {item.status === 'downloading' && (
                    <div className="w-24 bg-neutral-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                  )}
                  <span className="font-bold font-mono text-neutral-300">
                    {item.status === 'downloading' ? `${item.progressPercent}%` : 'Na fila'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DOWNLOADED MANGA LIST */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Mangás Disponíveis Offline
        </h3>

        {mangaGroups.length === 0 ? (
          /* Empty downloads state */
          <div id="downloads-empty-container" className="text-center py-16 px-4 bg-neutral-900/30 border border-neutral-800/60 rounded-3xl space-y-3 max-w-md mx-auto">
            <Download className="w-10 h-10 text-neutral-500 mx-auto" />
            <h4 className="text-base font-bold text-white">Nenhum conteúdo baixado</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Abra os detalhes de qualquer mangá e clique em "Baixar" para salvar capítulos e ler mesmo quando estiver sem internet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {mangaGroups.map((group) => (
              <div
                key={group.mangaId}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4"
              >
                {/* Manga title bar */}
                <div className="flex items-center justify-between gap-3 border-b border-neutral-800/80 pb-3">
                  <div className="flex items-center space-x-3">
                    {group.coverUrl && (
                      <img
                        src={getProxiedImageUrl(group.coverUrl)}
                        alt={group.mangaTitle}
                        className="w-10 h-14 object-cover rounded-lg border border-neutral-800 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white">
                        {group.mangaTitle}
                      </h4>
                      <p className="text-xs text-neutral-400">
                        {group.chapters.length}{' '}
                        {group.chapters.length === 1 ? 'capítulo baixado' : 'capítulos baixados'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Chapters list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {group.chapters.map((ch) => {
                    const chapterItem: ChapterItem = {
                      id: ch.chapterId,
                      mangaId: ch.mangaId,
                      volume: null,
                      chapter: ch.chapterNumber,
                      title: ch.chapterTitle || null,
                      language: 'pt-br',
                      publishAt: ch.downloadedAt,
                      pages: ch.pageCount,
                    };

                    const mangaItem: MangaItem = {
                      id: ch.mangaId,
                      sourceId: 'mangadex',
                      title: ch.mangaTitle,
                      description: '',
                      coverUrl: ch.coverUrl || '',
                      author: '',
                      artist: '',
                      status: 'ongoing',
                      genres: [],
                    };

                    return (
                      <div
                        key={ch.chapterId}
                        className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-white">
                            Capítulo {ch.chapterNumber}
                          </span>
                          {ch.chapterTitle && (
                            <p className="text-[11px] text-neutral-400 truncate">
                              {ch.chapterTitle}
                            </p>
                          )}
                          <span className="text-[10px] text-neutral-500">
                            {ch.pageCount} páginas
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onStartReading(chapterItem, mangaItem)}
                            className="px-2.5 py-1.5 bg-rose-900/40 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-xs font-semibold border border-rose-800 transition flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" /> Ler
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDownloadedChapter(ch.chapterId)}
                            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-rose-950/60 text-neutral-400 hover:text-rose-400 border border-neutral-800 transition cursor-pointer"
                            title="Excluir capítulo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      </section>
    </div>
  );
};
