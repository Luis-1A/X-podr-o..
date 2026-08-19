import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Flame,
  User as UserIcon,
  LogOut,
  Sparkles,
  LogIn,
} from 'lucide-react';

interface HeaderProps {
  onOpenAuth: () => void;
  onNavigate: (tab: string) => void;
  currentTab: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAuth, onNavigate }) => {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header id="main-header" className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800/80 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Logo */}
        <button
          id="logo-home-btn"
          type="button"
          onClick={() => onNavigate('discover')}
          className="flex items-center space-x-2.5 cursor-pointer text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-600 via-red-600 to-amber-500 flex items-center justify-center shadow-md shadow-rose-950/50 group-hover:scale-105 transition-transform">
            <span className="text-white font-black text-sm tracking-wider">X</span>
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight flex items-center gap-1 leading-none">
              <span className="text-rose-500 text-lg">X</span>
              <span className="text-amber-400 text-base">Podrão</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                MangaFire
              </span>
            </h1>
            <span className="text-[10px] text-neutral-400 font-medium tracking-wide">
              LEITOR RÁPIDO & FIRESTORE
            </span>
          </div>
        </button>

        {/* Right User Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {user ? (
            <div className="relative">
              <button
                id="user-profile-menu-btn"
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-200 transition cursor-pointer"
              >
                <div className="w-5 h-5 rounded-full bg-rose-600/30 border border-rose-500/50 flex items-center justify-center text-rose-400 font-bold text-[10px]">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[100px] truncate hidden sm:inline">{user.username}</span>
              </button>

              {showUserMenu && (
                <div
                  id="user-dropdown-menu"
                  className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-3 py-2 border-b border-neutral-800 text-neutral-400">
                    <p className="font-bold text-white truncate">{user.username}</p>
                    <p className="text-[10px] text-neutral-500 truncate">{user.email}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      onNavigate('settings');
                    }}
                    className="w-full px-3 py-2 text-left text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl transition flex items-center gap-2 cursor-pointer mt-1"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-rose-400" />
                    Preferências
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-950/40 rounded-xl transition flex items-center gap-2 cursor-pointer mt-0.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sair
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              id="header-login-btn"
              type="button"
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar / Cadastrar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
