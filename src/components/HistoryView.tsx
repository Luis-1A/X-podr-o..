import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGetHistory, getProxiedImageUrl } from '../services/api';
import { ReadingHistoryItem, ChapterItem, MangaItem } from '../types';
import { Clock, Play, BookOpen, AlertCircle, Flame } from 'lucide-react';

interface HistoryViewProps {
  onStartReading: (chapter: ChapterItem, manga: MangaItem, initialPage: number) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onStartReading }) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      try {
        const items = await apiGetHistory();
        setHistory(items);
      } catch (err) {
        console.warn('History fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [user]);

  return (
    <div id="history-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Clock className="w-3.5 h-3.5" />
          Cloud Firestore Sincronizado
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Histórico de Leitura</h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          Capítulos e páginas lidos recentemente no MangaFire
        </p>
      </div>

      {loading ? (
        <div className="p-12 bg-neutral-900 border border-neutral-800 rounded-2xl text-center space-y-3">
          <div className="w-8 h-8 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-neutral-400">Carregando histórico do Firestore...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="p-12 bg-neutral-900 border border-neutral-800 rounded-2xl text-center space-y-4">
          <Clock className="w-12 h-12 text-neutral-600 mx-auto" />
          <h3 className="text-base font-bold text-white">Nenhum histórico recente</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Comece a ler qualquer obra no catálogo do MangaFire para que seus capítulos lidos apareçam aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-4 flex items-center justify-between gap-4 transition"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-16 bg-neutral-950 rounded-xl overflow-hidden shrink-0 border border-neutral-800">
                  <img
                    src={getProxiedImageUrl(item.coverUrl || '')}
                    alt={item.mangaTitle}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&q=80';
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">{item.mangaTitle}</h4>
                  <p className="text-xs text-rose-400 font-semibold mt-0.5">
                    Capítulo {item.chapterNumber} (Pág. {item.page} de {item.totalPages})
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Lido em: {new Date(item.readAt).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(item.readAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onStartReading(
                    {
                      id: item.chapterId,
                      mangaId: item.mangaId,
                      volume: null,
                      chapter: item.chapterNumber,
                      title: item.chapterTitle,
                      sourceId: 'mangafire',
                      sourceName: 'MangaFire',
                      language: 'pt-br',
                      publishAt: item.readAt,
                      pages: item.totalPages,
                    },
                    {
                      id: item.mangaId,
                      sourceId: 'mangafire',
                      sourceName: 'MangaFire',
                      title: item.mangaTitle,
                      description: '',
                      coverUrl: item.coverUrl,
                      author: '',
                      artist: '',
                      status: 'ongoing',
                      genres: [],
                    },
                    item.page
                  )
                }
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-lg shadow-rose-950/50 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Continuar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
