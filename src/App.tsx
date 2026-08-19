import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { LibraryView } from './components/LibraryView';
import { DiscoverView } from './components/DiscoverView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { MangaDetailModal } from './components/MangaDetailModal';
import { ReaderView } from './components/ReaderView';
import { AuthModal } from './components/AuthModal';
import { ChapterItem, MangaItem } from './types';
import { apiGetMangaChapters } from './services/api';

function MainApp() {
  const { user, isLoading } = useAuth();

  const [currentTab, setCurrentTab] = useState<string>('discover');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Global window error listener to prevent silent app crashes
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      console.warn('[X Podrão Runtime Error caught]:', event.message, event.error);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.warn('[X Podrão Unhandled Promise Rejection]:', event.reason);
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Selected Manga Modal
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null);
  const [selectedMangaData, setSelectedMangaData] = useState<MangaItem | undefined>(undefined);

  // Active Reader
  const [activeReader, setActiveReader] = useState<{
    chapter: ChapterItem;
    manga: MangaItem;
    allChapters?: ChapterItem[];
    initialPage?: number;
  } | null>(null);

  const handleSelectManga = (mangaId: string, mangaData?: MangaItem) => {
    setSelectedMangaId(mangaId);
    setSelectedMangaData(mangaData);
  };

  const handleStartReading = async (
    chapter: ChapterItem,
    manga: MangaItem,
    initialPage: number = 1
  ) => {
    let allChapters: ChapterItem[] = [];
    try {
      allChapters = await apiGetMangaChapters(manga.id);
    } catch (e) {
      allChapters = [chapter];
    }

    setActiveReader({
      chapter,
      manga,
      allChapters,
      initialPage,
    });
  };

  return (
    <div id="xpodrao-app-root" className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      {/* Header */}
      <Header
        onOpenAuth={() => setAuthModalOpen(true)}
        onNavigate={(tab) => setCurrentTab(tab)}
        currentTab={currentTab}
      />

      {/* Top Desktop & Mobile Navigation */}
      <Navigation
        currentTab={currentTab}
        onNavigate={(tab) => setCurrentTab(tab)}
      />

      {/* Main Content Area with Error Boundary per view */}
      <main className="flex-1 p-4 sm:p-6">
        <ErrorBoundary fallbackTitle="Falha ao carregar conteúdo da aba">
          {currentTab === 'discover' && (
            <DiscoverView onSelectManga={handleSelectManga} />
          )}

          {currentTab === 'library' && (
            <LibraryView
              onSelectManga={handleSelectManga}
              onNavigateToDiscover={() => setCurrentTab('discover')}
            />
          )}

          {currentTab === 'history' && (
            <HistoryView onStartReading={handleStartReading} />
          )}

          {currentTab === 'settings' && <SettingsView />}
        </ErrorBoundary>
      </main>

      {/* Manga Detail Modal */}
      {selectedMangaId && (
        <MangaDetailModal
          mangaId={selectedMangaId}
          initialData={selectedMangaData}
          onClose={() => {
            setSelectedMangaId(null);
            setSelectedMangaData(undefined);
          }}
          onStartReading={(chapter, manga) => {
            handleStartReading(chapter, manga);
          }}
        />
      )}

      {/* Fullscreen Reader Modal */}
      {activeReader && (
        <ReaderView
          chapter={activeReader.chapter}
          manga={activeReader.manga}
          allChapters={activeReader.allChapters}
          initialPage={activeReader.initialPage}
          onClose={() => setActiveReader(null)}
          onSelectChapter={(nextCh) => {
            setActiveReader((prev) =>
              prev ? { ...prev, chapter: nextCh, initialPage: 1 } : null
            );
          }}
        />
      )}

      {/* Auth & Onboarding Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
