import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDownloads } from '../context/DownloadContext';
import { ExtensionItem } from '../types';
import { apiGetExtensions } from '../services/api';
import {
  Settings as SettingsIcon,
  Sliders,
  HardDrive,
  Globe,
  User as UserIcon,
  LogOut,
  Trash2,
  RefreshCw,
  Check,
  Smartphone,
  BookOpen,
  WifiOff,
  Wifi,
} from 'lucide-react';

const GENRES = [
  'Ação',
  'Aventura',
  'Romance',
  'Fantasia',
  'Comédia',
  'Drama',
  'Mistério',
  'Terror',
  'Ficção Científica',
  'Esportes',
  'Slice of Life',
  'Sobrenatural',
  'Isekai',
  'Psicológico',
  'Shounen',
  'Seinen',
];

export const SettingsView: React.FC = () => {
  const {
    user,
    profile,
    settings,
    updateSettings,
    updatePreferences,
    logout,
    isOnline,
    manualOffline,
    setManualOffline,
  } = useAuth();
  const { storageStats, refreshStorageStats } = useDownloads();

  const [readerMode, setReaderMode] = useState(settings?.reader_mode || 'webtoon');
  const [readingDirection, setReadingDirection] = useState(settings?.reading_direction || 'ltr');
  const [preloadNetwork, setPreloadNetwork] = useState<'wifi' | 'all' | 'off'>(
    settings?.preload_network || 'all'
  );
  const [maxCacheMb, setMaxCacheMb] = useState<number>(settings?.max_cache_mb || 500);
  const [cacheRetention, setCacheRetention] = useState<number>(
    settings?.cache_retention_chapters || 3
  );
  const [selectedGenres, setSelectedGenres] = useState<string[]>(profile?.preferredGenres || []);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(profile?.preferredLanguages || ['pt-br', 'en']);

  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [loadingExt, setLoadingExt] = useState<boolean>(false);
  const [extSearch, setExtSearch] = useState<string>('');
  const [extLangFilter, setExtLangFilter] = useState<string>('all');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setReaderMode(settings.reader_mode);
      setReadingDirection(settings.reading_direction);
      if (settings.preload_network) setPreloadNetwork(settings.preload_network);
      if (settings.max_cache_mb) setMaxCacheMb(settings.max_cache_mb);
      if (settings.cache_retention_chapters) setCacheRetention(settings.cache_retention_chapters);
    }
  }, [settings]);

  useEffect(() => {
    if (profile) {
      setSelectedGenres(profile.preferredGenres || []);
      setSelectedLangs(profile.preferredLanguages || ['pt-br', 'en']);
    }
  }, [profile]);

  // Fetch Keiyoushi official extensions catalog
  useEffect(() => {
    async function loadCatalog() {
      if (!isOnline) return;
      setLoadingExt(true);
      try {
        const list = await apiGetExtensions();
        setExtensions(list || []);
      } catch (err) {
        console.error('Error fetching extensions:', err);
      } finally {
        setLoadingExt(false);
      }
    }
    loadCatalog();
  }, [isOnline]);

  const handleSaveReaderSettings = async (mode: 'webtoon' | 'single' | 'double', dir: 'ltr' | 'rtl') => {
    setReaderMode(mode);
    setReadingDirection(dir);
    await updateSettings({ reader_mode: mode, reading_direction: dir });
    showSaved();
  };

  const toggleGenre = (genre: string) => {
    const next = selectedGenres.includes(genre)
      ? selectedGenres.filter((g) => g !== genre)
      : [...selectedGenres, genre];
    setSelectedGenres(next);
  };

  const handleSaveGenres = async () => {
    await updatePreferences(selectedGenres, selectedLangs);
    showSaved();
  };

  const showSaved = () => {
    setSavedMessage('Configurações salvas!');
    setTimeout(() => setSavedMessage(null), 2500);
  };

  // Filtered extensions from Keiyoushi
  const filteredExtensions = extensions.filter((ext) => {
    if (extLangFilter !== 'all' && ext.lang !== extLangFilter) return false;
    if (extSearch.trim()) {
      const q = extSearch.toLowerCase();
      return ext.name.toLowerCase().includes(q) || ext.pkg.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div id="settings-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-8 animate-in fade-in duration-150">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-rose-500" />
            Configurações & Fontes
          </h2>
          <p className="text-xs text-neutral-400">
            Ajuste o leitor, gerencie preferências de catálogo e configure fontes reais do Keiyoushi
          </p>
        </div>

        {savedMessage && (
          <span className="px-3 py-1 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-full text-xs font-semibold animate-in fade-in">
            {savedMessage}
          </span>
        )}
      </div>

      {/* 1. READER PREFERENCES */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Sliders className="w-4 h-4 text-rose-500" />
          Preferências do Leitor
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              Modo de Leitura Padrão:
            </label>
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => handleSaveReaderSettings('webtoon', readingDirection)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  readerMode === 'webtoon' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Webtoon (Vertical)
              </button>
              <button
                type="button"
                onClick={() => handleSaveReaderSettings('single', readingDirection)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  readerMode === 'single' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Página Única
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              Direção de Leitura (Modo Página):
            </label>
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => handleSaveReaderSettings(readerMode, 'ltr')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  readingDirection === 'ltr' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Esquerda &rarr; Direita (Ocidental)
              </button>
              <button
                type="button"
                onClick={() => handleSaveReaderSettings(readerMode, 'rtl')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  readingDirection === 'rtl' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Direita &rarr; Esquerda (Mangá)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. INTELLIGENT PRELOAD & AUTO-CACHE SETTINGS */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-rose-500" />
            Pré-carregamento Inteligente & Cache
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 border border-rose-800 text-rose-300 font-semibold">
            Buffer 5 Páginas Ativo
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          O X Podrão baixa 5 páginas antecipadamente para leitura instantânea, o restante do capítulo em 2º plano, e prepara o próximo capítulo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {/* Preload Network Policy */}
          <div className="space-y-1.5">
            <label className="block font-medium text-neutral-300">Conexão Permitida:</label>
            <select
              value={preloadNetwork}
              onChange={async (e) => {
                const val = e.target.value as 'wifi' | 'all' | 'off';
                setPreloadNetwork(val);
                await updateSettings({ preload_network: val });
                showSaved();
              }}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="all">Todas as Redes (Wi-Fi + Dados)</option>
              <option value="wifi">Somente no Wi-Fi</option>
              <option value="off">Desativar Pré-carregamento</option>
            </select>
          </div>

          {/* Cache Retention Chapters */}
          <div className="space-y-1.5">
            <label className="block font-medium text-neutral-300">Retenção por Mangá:</label>
            <select
              value={cacheRetention}
              onChange={async (e) => {
                const val = parseInt(e.target.value, 10);
                setCacheRetention(val);
                await updateSettings({ cache_retention_chapters: val });
                showSaved();
              }}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="2">Últimos 2 Capítulos</option>
              <option value="3">Últimos 3 Capítulos (Recomendado)</option>
              <option value="5">Últimos 5 Capítulos</option>
            </select>
          </div>

          {/* Max Cache Size MB */}
          <div className="space-y-1.5">
            <label className="block font-medium text-neutral-300">Limite Total de Cache:</label>
            <select
              value={maxCacheMb}
              onChange={async (e) => {
                const val = parseInt(e.target.value, 10);
                setMaxCacheMb(val);
                await updateSettings({ max_cache_mb: val });
                showSaved();
              }}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="250">250 MB</option>
              <option value="500">500 MB (Padrão)</option>
              <option value="1000">1 GB</option>
              <option value="2000">2 GB</option>
            </select>
          </div>
        </div>

        {/* Clear Temporary Cache Action */}
        <div className="flex items-center justify-between p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 mt-2">
          <div>
            <p className="font-semibold text-white text-xs">Limpar Cache Temporário Automático</p>
            <p className="text-neutral-400 text-[11px]">
              Remove apenas páginas em cache automático. Seus downloads manuais continuam 100% protegidos.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const { clearAllAutoCachedChapters } = await import('../services/storage');
              await clearAllAutoCachedChapters();
              showSaved();
            }}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpar Cache
          </button>
        </div>
      </section>

      {/* 3. GENRE PREFERENCES */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-rose-500" />
            Gêneros Favoritos & Descoberta
          </h3>
          <button
            type="button"
            onClick={handleSaveGenres}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            Salvar Preferências
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => {
            const isSelected = selectedGenres.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGenre(g)}
                className={`px-3 py-1.5 rounded-lg text-xs transition border flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-rose-900/40 border-rose-500 text-rose-200 font-semibold'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-rose-400" />}
                {g}
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. SOURCE PRIORITY & FALLBACK ENGINE */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-red-500" />
            Prioridade de Fontes & Fallback
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 font-semibold">
            Ativo
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          A ordem definida abaixo determina qual catálogo é consultado primeiro para capítulos e imagens:
        </p>

        <div className="space-y-2">
          <div className="bg-neutral-950 border border-amber-800/80 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center text-xs">
                1
              </span>
              <div>
                <p className="font-bold text-white">MangaFire (Prioridade Máxima)</p>
                <p className="text-[11px] text-neutral-400">Fonte primária para buscas, capítulos e leituras</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700 text-amber-300 text-[10px] font-bold">
              Prioridade 1
            </span>
          </div>

          <div className="bg-neutral-950 border border-red-800/60 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3">
              <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 font-black flex items-center justify-center text-xs">
                2
              </span>
              <div>
                <p className="font-bold text-white">MangaDex (Fallback Automático)</p>
                <p className="text-[11px] text-neutral-400">Acionado se MangaFire estiver indisponível ou incompleta</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-800 text-red-300 text-[10px] font-bold">
              Fallback 1
            </span>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3">
              <span className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-400 font-black flex items-center justify-center text-xs">
                3
              </span>
              <div>
                <p className="font-bold text-white">Keiyoushi Extensões (Comunidade)</p>
                <p className="text-[11px] text-neutral-400">Repositório index.json para descoberta adicional</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-400 text-[10px] font-bold">
              Fallback 2
            </span>
          </div>
        </div>
      </section>

      {/* 4. KEIYOUSHI EXTENSIONS & SOURCES CATALOG */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-rose-500" />
              Catálogo Oficial Keiyoushi
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-normal">
                {extensions.length} extensões
              </span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Repositório oficial Keiyoushi (index.json) integrado para descoberta de fontes de mangás
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={extLangFilter}
              onChange={(e) => setExtLangFilter(e.target.value)}
              className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-200 focus:outline-none"
            >
              <option value="all">Todos os idiomas</option>
              <option value="pt-BR">🇧🇷 Português</option>
              <option value="en">🇺🇸 Inglês</option>
              <option value="es">🇪🇸 Espanhol</option>
              <option value="all">🌐 Multilíngue</option>
            </select>
          </div>
        </div>

        <input
          type="text"
          value={extSearch}
          onChange={(e) => setExtSearch(e.target.value)}
          placeholder="Filtrar extensão (ex: MangaDex, Comic, Scan)..."
          className="w-full px-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500"
        />

        {loadingExt ? (
          <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-rose-500" /> Carregando catálogo Keiyoushi...
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {filteredExtensions.slice(0, 30).map((ext) => (
              <div
                key={ext.pkg}
                className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-rose-400 shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h5 className="font-bold text-white truncate">{ext.name}</h5>
                    <p className="text-[11px] text-neutral-400 font-mono">
                      v{ext.version} • {ext.lang?.toUpperCase() || 'MULTI'} • {ext.pkg}
                    </p>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] font-semibold shrink-0">
                  Conectada
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. STORAGE & NETWORK SIMULATION */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-rose-500" />
          Armazenamento Local & Rede
        </h3>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3.5 bg-neutral-950 rounded-xl border border-neutral-800">
            <div>
              <p className="font-semibold text-white">Espaço ocupado por capítulos:</p>
              <p className="text-neutral-400 text-[11px]">
                {storageStats.formatted} ({storageStats.chapterCount} capítulos)
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const db = await import('../services/storage');
                const chapters = await db.getAllDownloadedChapters();
                for (const ch of chapters) {
                  await db.deleteDownloadedChapter(ch.chapterId);
                }
                await refreshStorageStats();
                showSaved();
              }}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-rose-950/60 text-neutral-400 hover:text-rose-400 border border-neutral-800 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpar Downloads
            </button>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-neutral-950 rounded-xl border border-neutral-800">
            <div>
              <p className="font-semibold text-white">Alternar Modo Offline:</p>
              <p className="text-neutral-400 text-[11px]">
                {manualOffline
                  ? 'Modo offline forçado (somente biblioteca e downloads locais ativos)'
                  : 'Modo padrão conectado à internet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setManualOffline(!manualOffline)}
              className={`px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                manualOffline
                  ? 'bg-amber-950 border-amber-800 text-amber-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              {manualOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
              {manualOffline ? 'Offline Ativo' : 'Online'}
            </button>
          </div>
        </div>
      </section>

      {/* 5. ACCOUNT */}
      {user && (
        <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-rose-500" />
            Conta do Usuário
          </h3>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-neutral-950 rounded-xl border border-neutral-800 text-xs">
            <div>
              <p className="font-bold text-white text-sm">{user.username}</p>
              <p className="text-neutral-400">{user.email}</p>
              <p className="text-neutral-500 text-[11px] mt-0.5">ID: {user.id}</p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-xl font-semibold transition cursor-pointer flex items-center gap-2 self-start sm:self-center"
            >
              <LogOut className="w-4 h-4" /> Sair da Conta
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
