import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGetHistory, apiDeleteHistoryItem, apiClearHistory, getProxiedImageUrl } from '../services/api';
import { ReadingHistoryItem, ChapterItem, MangaItem } from '../types';
import { Clock, Trash2, Play, BookOpen, AlertCircle } from 'lucide-react';

interface HistoryViewProps {
  onStartReading: (chapter: ChapterItem, manga: MangaItem, initialPage: number) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onStartReading }) => {
  const { user, isOnline } = useAuth();
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHistory = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await apiGetHistory();
      setHistory(items);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user, isOnline]);

  const handleDeleteItem = async (chapterId: string) => {
    await apiDeleteHistoryItem(chapterId);
    setHistory((prev) => prev.filter((h) => h.chapterId !== chapterId));
  };

  const handleClearAll = async () => {
    if (window.confirm('Deseja realmente limpar todo o histórico de leitura?')) {
      await apiClearHistory();
      setHistory([]);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div id="history-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-rose-500" />
            Histórico de Leitura
          </h2>
          <p className="text-xs text-neutral-400">
            Registro cronológico das páginas e capítulos que você leu
          </p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-rose-950/40 text-neutral-400 hover:text-rose-400 border border-neutral-800 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpar Histórico
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs text-neutral-400">
          Carregando histórico...
        </div>
      ) : history.length === 0 ? (
        /* Real Empty History State */
        <div id="history-empty-container" className="text-center py-16 px-4 bg-neutral-900/30 border border-neutral-800/60 rounded-3xl space-y-3 max-w-md mx-auto">
          <Clock className="w-10 h-10 text-neutral-500 mx-auto" />
          <h4 className="text-base font-bold text-white">Você ainda não possui histórico de leitura</h4>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Comece a ler qualquer mangá para que seus capítulos e páginas sejam registrados automaticamente aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => {
            const chItem: ChapterItem = {
              id: item.chapterId,
              mangaId: item.mangaId,
              volume: null,
              chapter: item.chapterNumber,
              title: item.chapterTitle || null,
              language: 'pt-br',
              publishAt: item.readAt,
              pages: item.totalPages,
            };

            const mangaItem: MangaItem = {
              id: item.mangaId,
              sourceId: 'mangadex',
              title: item.mangaTitle,
              description: '',
              coverUrl: item.coverUrl || '',
              author: '',
              artist: '',
              status: 'ongoing',
              genres: [],
            };

            return (
              <div
                key={item.chapterId}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {item.coverUrl ? (
                    <img
                      src={getProxiedImageUrl(item.coverUrl)}
                      alt={item.mangaTitle}
                      className="w-12 h-16 object-cover rounded-xl border border-neutral-800 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-600 shrink-0">
                      <BookOpen className="w-6 h-6" />
                    </div>
                  )}

                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300">
                      Capítulo {item.chapterNumber} • Página {item.page} de {item.totalPages}
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-white leading-tight truncate">
                      {item.mangaTitle}
                    </h4>
                    <p className="text-[11px] text-neutral-400">
                      Lido em: {formatTime(item.readAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartReading(chItem, mangaItem, item.page)}
                    className="px-3 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Continuar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.chapterId)}
                    className="p-2 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition cursor-pointer"
                    title="Remover do histórico"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
