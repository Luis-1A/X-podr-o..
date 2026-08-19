import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Settings as SettingsIcon,
  User as UserIcon,
  LogOut,
  Flame,
  Check,
  Smartphone,
  BookOpen,
  Cloud,
  CheckCircle2,
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
  } = useAuth();

  const [readerMode, setReaderMode] = useState(settings?.reader_mode || 'webtoon');
  const [readingDirection, setReadingDirection] = useState(settings?.reading_direction || 'ltr');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(profile?.preferredGenres || []);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setReaderMode(settings.reader_mode);
      setReadingDirection(settings.reading_direction);
    }
  }, [settings]);

  useEffect(() => {
    if (profile) {
      setSelectedGenres(profile.preferredGenres || []);
    }
  }, [profile]);

  const handleSavePreferences = async () => {
    await updatePreferences(selectedGenres, profile?.preferredLanguages || ['pt-br', 'en']);
    await updateSettings({ reader_mode: readerMode, reading_direction: readingDirection });
    setSavedMessage('Configurações salvas no Cloud Firestore!');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  return (
    <div id="settings-view-root" className="max-w-4xl mx-auto space-y-6 pb-24 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <SettingsIcon className="w-3.5 h-3.5" />
          Painel de Controle
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Configurações & Conta</h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          Gerencie seu perfil Firebase, preferências de leitura e integração MangaFire.
        </p>
      </div>

      {savedMessage && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {savedMessage}
        </div>
      )}

      {/* Account Info */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-rose-500" /> Perfil de Usuário (Firebase Auth)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800/80">
            <span className="text-neutral-500 block mb-1">Nome / Usuário</span>
            <span className="font-bold text-white text-sm">{user?.username || 'Visitante'}</span>
          </div>

          <div className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800/80">
            <span className="text-neutral-500 block mb-1">E-mail Cadastrado</span>
            <span className="font-bold text-white text-sm">{user?.email || 'Sem e-mail'}</span>
          </div>
        </div>

        {user && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 bg-neutral-800 hover:bg-rose-950/60 hover:text-rose-400 text-neutral-300 rounded-xl text-xs font-semibold border border-neutral-700/60 transition flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Sair da conta
            </button>
          </div>
        )}
      </div>

      {/* Source Infrastructure Info */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Flame className="w-4 h-4 text-rose-500" /> Fonte Primária de Catálogo
        </h2>

        <div className="p-4 bg-neutral-950 rounded-xl border border-rose-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">MangaFire (Oficial)</h4>
              <p className="text-xs text-neutral-400">
                Arquitetura simplificada com busca em 2 etapas, sem concorrência lenta de dezenas de extensões.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
            Ativo & Rápido
          </span>
        </div>
      </div>

      {/* Reader Preferences */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-rose-500" /> Preferências do Leitor
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              Modo de exibição padrão:
            </label>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => setReaderMode('webtoon')}
                className={`p-3 rounded-xl border text-xs font-semibold transition text-left cursor-pointer ${
                  readerMode === 'webtoon'
                    ? 'bg-rose-950/60 border-rose-500 text-rose-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                📜 Webtoon (Rolagem Contínua)
              </button>
              <button
                type="button"
                onClick={() => setReaderMode('single')}
                className={`p-3 rounded-xl border text-xs font-semibold transition text-left cursor-pointer ${
                  readerMode === 'single'
                    ? 'bg-rose-950/60 border-rose-500 text-rose-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                📖 Paginado (Uma por vez)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              Gêneros de interesse (sincronizados no Firestore):
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
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
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={handleSavePreferences}
            className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-950/50 cursor-pointer"
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};
