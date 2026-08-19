import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserProfile, UserSettings } from '../types';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import {
  firebaseLoginUser,
  firebaseRegisterUser,
  firebaseGoogleSignIn,
  firebaseGuestSignIn,
  firebaseSignOutUser,
  apiUpdateSettings,
} from '../services/api';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isOnline: boolean;
  manualOffline: boolean;
  setManualOffline: (val: boolean) => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (username: string, email: string, pass: string, genres?: string[], langs?: string[]) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  guestLogin: () => Promise<void>;
  logout: () => void;
  updatePreferences: (genres: string[], langs: string[]) => Promise<void>;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>({
    reader_mode: 'webtoon',
    reading_direction: 'ltr',
    page_fit: 'width',
    auto_download_next: 1,
    keep_downloads: 5,
    theme: 'dark',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [manualOffline, setManualOffline] = useState<boolean>(false);

  // Network state listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (fbUser) {
        let username = fbUser.displayName || fbUser.email?.split('@')[0] || 'Leitor';
        let genres: string[] = [];
        let langs: string[] = ['pt-br', 'en'];

        try {
          // Fetch user profile doc
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.name) username = data.name;
          }

          // Fetch preferences doc
          const prefDoc = await getDoc(doc(db, 'users', fbUser.uid, 'settings', 'preferences'));
          if (prefDoc.exists()) {
            const p = prefDoc.data();
            setSettings((prev) => ({ ...prev!, ...p }));
            if (p.preferredGenres) genres = p.preferredGenres;
            if (p.preferredLanguages) langs = p.preferredLanguages;
          }
        } catch (e) {
          console.warn('Could not fetch user settings from Firestore (offline or initial):', e);
        }

        const activeUser: User = {
          id: fbUser.uid,
          username,
          email: fbUser.email || 'visitante@xpodrao.local',
          isGuest: fbUser.isAnonymous,
        };

        setUser(activeUser);
        setProfile({
          displayName: username,
          preferredGenres: genres,
          preferredLanguages: langs,
        });
        localStorage.setItem('xpodrao_cached_user', JSON.stringify(activeUser));
      } else {
        // Check for cached local guest
        const cached = localStorage.getItem('xpodrao_cached_user');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setUser(parsed);
            setProfile({
              displayName: parsed.username,
              preferredGenres: [],
              preferredLanguages: ['pt-br', 'en'],
            });
          } catch (e) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await firebaseLoginUser(email, pass);
    setUser(res.user);
    setProfile(res.profile);
    if (res.settings) setSettings(res.settings);
  };

  const register = async (username: string, email: string, pass: string, genres?: string[], langs?: string[]) => {
    const res = await firebaseRegisterUser(email, pass, username, genres, langs);
    setUser(res.user);
    setProfile(res.profile);
    if (res.settings) setSettings(res.settings);
  };

  const loginWithGoogle = async () => {
    const res = await firebaseGoogleSignIn();
    setUser(res.user);
    setProfile(res.profile);
    if (res.settings) setSettings(res.settings);
  };

  const guestLogin = async () => {
    const res = await firebaseGuestSignIn();
    setUser(res.user);
    setProfile(res.profile);
    if (res.settings) setSettings(res.settings);
  };

  const logout = async () => {
    await firebaseSignOutUser();
    setUser(null);
    setProfile(null);
  };

  const updatePreferences = async (genres: string[], langs: string[]) => {
    setProfile((prev) => (prev ? { ...prev, preferredGenres: genres, preferredLanguages: langs } : null));
    await apiUpdateSettings({ preferredGenres: genres, preferredLanguages: langs });
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...newSettings } : null));
    await apiUpdateSettings(newSettings);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        settings,
        isLoading,
        isOnline,
        manualOffline,
        setManualOffline,
        login,
        register,
        loginWithGoogle,
        guestLogin,
        logout,
        updatePreferences,
        updateSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
