import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDownloads } from '../context/DownloadContext';
import {
  BookOpen,
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  User as UserIcon,
  LogOut,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface HeaderProps {
  onOpenAuth: () => void;
  onNavigate: (tab: string) => void;
  currentTab: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAuth, onNavigate }) => {
  const { user, isOnline, manualOffline, setManualOffline, logout, syncPendingData } = useAuth();
  const { isDownloading, queue, storageStats } = useDownloads();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSyncClick = async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      const count = await syncPendingData();
      setSyncMessage(count > 0 ? `${count} itens sincronizados` : 'Tudo atualizado');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (e) {
      setSyncMessage('Erro na sincronização');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleOfflineMode = () => {
    setManualOffline(!manualOffline);
  };

  return (
    <header id="main-header" className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800/80 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Logo */}
        <button
          id="logo-home-btn"
          type="button"
          onClick={() => onNavigate('library')}
          className="flex items-center space-x-2.5 cursor-pointer text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-red-600 via-rose-600 to-amber-500 flex items-center justify-center shadow-md shadow-red-950/50 group-hover:scale-105 transition-transform">
            <span className="text-white font-black text-sm tracking-wider">X</span>
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight flex items-center gap-1 leading-none">
              <span className="text-red-500 text-lg">X</span>
              <span className="text-amber-400 text-base">Podrão</span>
            </h1>
            <span className="text-[10px] text-neutral-400 font-medium tracking-wide">
              READER & LIBRARY
            </span>
          </div>
        </button>

        {/* Center/Right Actions: Online/Offline Switch, Sync, Downloads, Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Online / Offline Switch Indicator */}
          <button
            id="network-mode-toggle-btn"
            type="button"
            onClick={toggleOfflineMode}
            title={isOnline ? 'Online (Clique para alternar para modo offline)' : 'Modo Offline (Clique para alternar para online)'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
              isOnline
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/40'
                : 'bg-amber-950/60 border-amber-800 text-amber-300 hover:bg-amber-900/60'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Offline</span>
              </>
            )}
          </button>

          {/* Sync Button */}
          {isOnline && (
            <button
              id="sync-now-btn"
              type="button"
              onClick={handleSyncClick}
              disabled={isSyncing}
              title="Sincronizar progresso e biblioteca com a nuvem"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-neutral-400 ${isSyncing ? 'animate-spin text-rose-400' : ''}`} />
              <span className="hidden md:inline">
                {syncMessage || (isSyncing ? 'Sincronizando...' : 'Sincronizar')}
              </span>
            </button>
          )}

          {/* Active Downloads Indicator */}
          <button
            id="header-downloads-btn"
            type="button"
            onClick={() => onNavigate('downloads')}
            title="Gerenciador de downloads"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition cursor-pointer relative"
          >
            <Download className={`w-3.5 h-3.5 ${isDownloading ? 'text-rose-400 animate-bounce' : 'text-neutral-400'}`} />
            <span className="hidden md:inline">Downloads</span>
            {queue.length > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-[10px] font-bold">
                {queue.length}
              </span>
            )}
            {queue.length === 0 && storageStats.chapterCount > 0 && (
              <span className="text-[10px] text-neutral-400 hidden sm:inline">
                ({storageStats.chapterCount})
              </span>
            )}
          </button>

          {/* User Account / Profile */}
          {user ? (
            <div className="relative">
              <button
                id="user-profile-menu-btn"
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 py-1 px-2.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer"
              >
                <div className="w-6 h-6 rounded-full bg-rose-900/60 border border-rose-600/40 text-rose-200 flex items-center justify-center text-xs font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-neutral-200 max-w-[100px] truncate hidden sm:inline">
                  {user.username}
                </span>
              </button>

              {/* Dropdown */}
              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div
                    id="user-dropdown-menu"
                    className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl py-1.5 z-50 text-xs"
                  >
                    <div className="px-3 py-2 border-b border-neutral-800">
                      <p className="font-semibold text-white truncate">{user.username}</p>
                      <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); onNavigate('settings'); }}
                      className="w-full text-left px-3 py-2 text-neutral-300 hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" /> Configurações & Preferências
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); logout(); }}
                      className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer border-t border-neutral-800/60"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sair da conta
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              id="header-open-auth-btn"
              type="button"
              onClick={onOpenAuth}
              className="py-1.5 px-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-sm"
            >
              Entrar / Criar Conta
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
