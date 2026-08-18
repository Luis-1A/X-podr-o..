import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DownloadProvider } from './context/DownloadContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { LibraryView } from './components/LibraryView';
import { DiscoverView } from './components/DiscoverView';
import { DownloadsView } from './components/DownloadsView';
import { UpdatesView } from './components/UpdatesView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { MangaDetailModal } from './components/MangaDetailModal';
import { ReaderView } from './components/ReaderView';
import { AuthModal } from './components/AuthModal';
import { ChapterItem, MangaItem, ReadingProgress } from './types';
import { apiGetMangaChapters, apiGetMangaDetails } from './services/api';

function MainApp() {
  const { user, isLoading } = useAuth();

  const [currentTab, setCurrentTab] = useState<string>('library');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

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

  // Check if initial authentication welcome modal should open
  useEffect(() => {
    if (!isLoading && !user) {
      setAuthModalOpen(true);
    }
  }, [isLoading, user]);

  const handleSelectManga = (mangaId: string, mangaData?: MangaItem) => {
    setSelectedMangaId(mangaId);
    setSelectedMangaData(mangaData);
  };

  const handleStartReading = async (
    chapter: ChapterItem,
    manga: MangaItem,
    initialPage: number = 1
  ) => {
    // If we don't have all chapters, attempt to load them for prev/next buttons
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

  const handleResumeReading = async (prog: ReadingProgress) => {
    try {
      const manga = await apiGetMangaDetails(prog.mangaId);
      const allChapters = await apiGetMangaChapters(prog.mangaId);
      const targetChapter = allChapters.find((c) => c.id === prog.chapterId) || {
        id: prog.chapterId,
        mangaId: prog.mangaId,
        volume: null,
        chapter: prog.chapterNumber,
        title: prog.chapterTitle || null,
        language: 'pt-br',
        publishAt: prog.updatedAt,
        pages: prog.totalPages,
      };

      if (manga) {
        setActiveReader({
          chapter: targetChapter,
          manga,
          allChapters,
          initialPage: prog.currentPage,
        });
      }
    } catch (err) {
      console.error('Error resuming reading:', err);
    }
  };

  return (
    <div id="xpodrao-app-root" className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* Header */}
      <Header
        onOpenAuth={() => setAuthModalOpen(true)}
        onNavigate={(tab) => setCurrentTab(tab)}
        currentTab={currentTab}
      />

      {/* Top Desktop Navigation */}
      <Navigation
        currentTab={currentTab}
        onNavigate={(tab) => setCurrentTab(tab)}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentTab === 'library' && (
          <LibraryView
            onSelectManga={handleSelectManga}
            onResumeReading={handleResumeReading}
            onNavigateToDiscover={() => setCurrentTab('discover')}
          />
        )}

        {currentTab === 'discover' && (
          <DiscoverView onSelectManga={handleSelectManga} />
        )}

        {currentTab === 'downloads' && (
          <DownloadsView onStartReading={handleStartReading} />
        )}

        {currentTab === 'updates' && (
          <UpdatesView onSelectManga={(id) => handleSelectManga(id)} />
        )}

        {currentTab === 'history' && (
          <HistoryView onStartReading={handleStartReading} />
        )}

        {currentTab === 'settings' && <SettingsView />}
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
    <AuthProvider>
      <DownloadProvider>
        <MainApp />
      </DownloadProvider>
    </AuthProvider>
  );
}
