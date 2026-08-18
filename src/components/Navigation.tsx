import React from 'react';
import { BookMarked, Compass, Download, Clock, Bell, Settings } from 'lucide-react';

interface NavigationProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  updatesCount?: number;
  downloadCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onNavigate,
  updatesCount = 0,
  downloadCount = 0,
}) => {
  const tabs = [
    { id: 'library', label: 'Biblioteca', icon: BookMarked },
    { id: 'discover', label: 'Descobrir', icon: Compass },
    { id: 'downloads', label: 'Downloads', icon: Download, badge: downloadCount },
    { id: 'history', label: 'Histórico', icon: Clock },
    { id: 'updates', label: 'Atualizações', icon: Bell, badge: updatesCount },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <>
      {/* Desktop Top Tab Bar */}
      <nav id="desktop-navigation-bar" className="hidden md:flex max-w-7xl mx-auto px-6 pt-3 pb-1 items-center justify-start space-x-1 border-b border-neutral-900">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer relative ${
                isActive
                  ? 'bg-neutral-800/90 text-white shadow-sm border border-neutral-700/60'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-red-400' : 'text-neutral-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-600 text-white font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav id="mobile-bottom-navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-lg border-t border-neutral-800/90 px-2 py-1.5 flex justify-around items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`mobile-nav-tab-${tab.id}`}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-medium transition cursor-pointer relative min-w-[50px] ${
                isActive ? 'text-red-400 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-red-500' : 'text-neutral-400'}`} />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full text-[9px] bg-red-600 text-white font-bold">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="truncate max-w-[64px]">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
