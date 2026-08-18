import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Sparkles, Check, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';

const AVAILABLE_GENRES = [
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

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, register, guestLogin } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<'form' | 'preferences'>('form');

  // Form states
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['pt-br', 'en']);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleLang = (lang: string) => {
    setSelectedLangs((prev) =>
      prev.includes(lang) ? (prev.length > 1 ? prev.filter((l) => l !== lang) : prev) : [...prev, lang]
    );
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    try {
      await login(username.trim(), password);
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao entrar. Verifique seus dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (username.trim().length < 3) {
      setError('O nome de usuário deve ter pelo menos 3 caracteres.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setStep('preferences');
  };

  const handleCompleteRegister = async () => {
    setError(null);
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password, selectedGenres, selectedLangs);
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar conta.');
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setError(null);
    setLoading(true);
    try {
      await guestLogin();
      if (onClose) onClose();
    } catch (err: any) {
      setError('Erro ao iniciar como visitante.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div id="auth-modal-container" className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 text-neutral-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-red-950/40">
            <span className="text-white font-black text-lg">X</span>
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-1.5">
              <span className="text-red-500">X</span>
              <span className="text-amber-400">Podrão</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium border border-red-500/30">
                v2.0
              </span>
            </h2>
            <p className="text-xs text-neutral-400">Leitor e biblioteca de mangás com prioridade MangaFire</p>
          </div>
        </div>

        {error && (
          <div id="auth-error-alert" className="mb-5 p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {step === 'form' ? (
          <>
            {/* Tabs */}
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800/80 mb-6">
              <button
                id="tab-login-btn"
                type="button"
                onClick={() => { setTab('login'); setError(null); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  tab === 'login'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Entrar
              </button>
              <button
                id="tab-register-btn"
                type="button"
                onClick={() => { setTab('register'); setError(null); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  tab === 'register'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Criar conta
              </button>
            </div>

            {tab === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Nome de usuário ou E-mail
                  </label>
                  <input
                    id="login-username-input"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Seu usuário ou e-mail"
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Senha
                  </label>
                  <input
                    id="login-password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha"
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm transition"
                  />
                </div>

                <button
                  id="submit-login-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium rounded-xl text-sm transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Entrando...' : 'Entrar na Conta'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterNext} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Nome de usuário
                  </label>
                  <input
                    id="register-username-input"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex: anime_reader"
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    E-mail
                  </label>
                  <input
                    id="register-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Senha
                    </label>
                    <input
                      id="register-password-input"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 dígitos"
                      className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Confirmar
                    </label>
                    <input
                      id="register-confirm-password-input"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm transition"
                    />
                  </div>
                </div>

                <button
                  id="submit-register-next-btn"
                  type="submit"
                  className="w-full mt-2 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium rounded-xl text-sm transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Continuar para Preferências <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            <div className="mt-6 pt-5 border-t border-neutral-800/80 text-center">
              <button
                id="continue-as-guest-btn"
                type="button"
                onClick={handleGuest}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-neutral-800/60 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl text-xs font-medium border border-neutral-700/60 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-neutral-400" />
                Continuar sem conta (Modo Visitante)
              </button>
            </div>
          </>
        ) : (
          /* Step 2: Preferences Selection */
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
            <div>
              <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold mb-1">
                <Sparkles className="w-4 h-4" /> ETAPA 2: CONFIGURAÇÃO INICIAL
              </div>
              <h3 className="text-base font-bold text-white">Quais gêneros você prefere?</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Usaremos suas escolhas reais para organizar recomendações e descobertas.
              </p>
            </div>

            {/* Languages */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Idiomas preferidos para tradução:
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'pt-br', label: '🇧🇷 Português (Brasil)' },
                  { id: 'en', label: '🇺🇸 English' },
                  { id: 'es', label: '🇪🇸 Español' },
                ].map((l) => {
                  const isSelected = selectedLangs.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLang(l.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isSelected
                          ? 'bg-rose-950/60 border-rose-500/80 text-rose-300 font-semibold'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Genres */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Gêneros favoritos (opcional):
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {AVAILABLE_GENRES.map((g) => {
                  const isSelected = selectedGenres.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGenre(g)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition border flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-rose-900/40 border-rose-500 text-rose-200 font-semibold'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-rose-400" />}
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                id="complete-register-btn"
                type="button"
                onClick={handleCompleteRegister}
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium rounded-xl text-xs transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Criando sua conta...' : 'Concluir e Abrir MangaVerse'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
