import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserProfile, UserSettings } from '../types';
import { apiGetMe, apiLogin, apiRegister, apiGuest, apiUpdatePreferences, apiUpdateSettings, syncOfflineProgressQueue } from '../services/api';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isOnline: boolean;
  manualOffline: boolean;
  setManualOffline: (val: boolean) => void;
  login: (login: string, pass: string) => Promise<void>;
  register: (username: string, email: string, pass: string, genres?: string[], langs?: string[]) => Promise<void>;
  guestLogin: () => Promise<void>;
  logout: () => void;
  updatePreferences: (genres: string[], langs: string[]) => Promise<void>;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  syncPendingData: () => Promise<number>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [manualOffline, setManualOffline] = useState<boolean>(false);

  // Network state listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync offline reading progress when network returns
      syncOfflineProgressQueue().then((count) => {
        if (count > 0) {
          console.log(`[X Podrão] Sincronizados ${count} registros de progresso salvos offline.`);
        }
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial session check
  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('xpodrao_auth_token') || localStorage.getItem('mangaverse_auth_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await apiGetMe();
        if (data && data.user) {
          setUser(data.user);
          setProfile(data.profile);
          setSettings(data.settings);
        }
      } catch (err) {
        console.warn('Session verification failed, logging out or offline mode:', err);
        // If offline, preserve cached user
        const cachedUser = localStorage.getItem('xpodrao_cached_user') || localStorage.getItem('mangaverse_cached_user');
        if (cachedUser) {
          try {
            setUser(JSON.parse(cachedUser));
          } catch (e) {}
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (loginId: string, pass: string) => {
    const res = await apiLogin(loginId, pass);
    setUser(res.user);
    setProfile(res.profile);
    localStorage.setItem('xpodrao_cached_user', JSON.stringify(res.user));
    await syncPendingData();
  };

  const register = async (username: string, email: string, pass: string, genres?: string[], langs?: string[]) => {
    const res = await apiRegister({
      username,
      email,
      password: pass,
      preferredGenres: genres,
      preferredLanguages: langs,
    });
    setUser(res.user);
    setProfile(res.profile);
    localStorage.setItem('xpodrao_cached_user', JSON.stringify(res.user));
  };

  const guestLogin = async () => {
    const res = await apiGuest();
    setUser(res.user);
    setProfile(res.profile);
    localStorage.setItem('xpodrao_cached_user', JSON.stringify(res.user));
  };

  const logout = () => {
    localStorage.removeItem('xpodrao_auth_token');
    localStorage.removeItem('mangaverse_auth_token');
    localStorage.removeItem('xpodrao_cached_user');
    localStorage.removeItem('mangaverse_cached_user');
    setUser(null);
    setProfile(null);
    setSettings(null);
  };

  const updatePreferences = async (genres: string[], langs: string[]) => {
    await apiUpdatePreferences({ preferredGenres: genres, preferredLanguages: langs });
    setProfile((prev) => prev ? { ...prev, preferredGenres: genres, preferredLanguages: langs } : null);
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    await apiUpdateSettings(newSettings);
    setSettings((prev) => prev ? { ...prev, ...newSettings } : null);
  };

  const syncPendingData = async (): Promise<number> => {
    if (effectiveOnline) {
      return await syncOfflineProgressQueue();
    }
    return 0;
  };

  const effectiveOnline = isOnline && !manualOffline;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        settings,
        isLoading,
        isOnline: effectiveOnline,
        manualOffline,
        setManualOffline,
        login,
        register,
        guestLogin,
        logout,
        updatePreferences,
        updateSettings,
        syncPendingData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
