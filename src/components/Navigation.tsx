import React from 'react';
import { BookMarked, Compass, Clock, Settings } from 'lucide-react';

interface NavigationProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onNavigate,
}) => {
  const tabs = [
    { id: 'discover', label: 'Descobrir', icon: Compass },
    { id: 'library', label: 'Favoritos', icon: BookMarked },
    { id: 'history', label: 'Histórico', icon: Clock },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <>
      {/* Desktop Top Tab Bar */}
      <nav id="desktop-navigation-bar" className="hidden md:flex max-w-7xl mx-auto px-6 pt-3 pb-1 items-center justify-start space-x-2 border-b border-neutral-900">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer relative ${
                isActive
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-rose-500' : 'text-neutral-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav id="mobile-bottom-navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-lg border-t border-neutral-800/90 px-3 py-2 flex justify-around items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`mobile-nav-tab-${tab.id}`}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[11px] font-medium transition cursor-pointer ${
                isActive ? 'text-rose-500 font-bold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-rose-500' : 'text-neutral-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
