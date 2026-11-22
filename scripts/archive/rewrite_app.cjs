const fs = require('fs');

const appContent = `import React, { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import { Search, ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, Maximize, Columns, LayoutGrid, RotateCcw, Loader2 } from 'lucide-react';
import { Channel } from './types';
import AndroidEmulator from './components/AndroidEmulator';
import { lazy } from 'react';
import { FIFA_CHANNELS } from './data/fifaChannels';
import { EXTRA_CHANNELS } from './data/extraChannels';

const VideoPlayer = lazy(() => import('./components/VideoPlayer'));

const INITIAL_CHANNELS: Channel[] = [
  ...FIFA_CHANNELS,
  ...EXTRA_CHANNELS
];

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('shahintv-favorites') || '[]'); } catch { return []; }
  });
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('shahintv-history') || '[]'); } catch { return []; }
  });
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL');
  
  useEffect(() => {
    fetch('https://iptv-org.github.io/iptv/index.category.m3u')
      .then(res => res.text())
      .then(data => {
        const lines = data.split('\\n');
        const parsedChannels: Channel[] = [];
        let currentChannel: any = null;
        let idCounter = 1000;
        
        for (const line of lines) {
          if (line.startsWith('#EXTINF:')) {
            currentChannel = {};
            const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
            const groupTitleMatch = line.match(/group-title="([^"]*)"/);
            const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
            
            currentChannel.id = 'iptv-org-' + idCounter++;
            currentChannel.name = tvgNameMatch ? tvgNameMatch[1] : line.split(',').pop()?.trim() || 'Unknown';
            currentChannel.category = groupTitleMatch ? groupTitleMatch[1].trim() : 'GENERAL';
            currentChannel.iconUrl = tvgLogoMatch ? tvgLogoMatch[1] : undefined;
            currentChannel.status = 'live';
            currentChannel.viewersCount = Math.floor(Math.random() * 5000) + 100;
            currentChannel.currentProgram = 'No Program Found';
            currentChannel.nextProgram = 'No Program Found';
            currentChannel.provider = 'IPTV Org';
          } else if (line.startsWith('http') && currentChannel) {
            currentChannel.m3u8Url = line.trim();
            parsedChannels.push(currentChannel as Channel);
            currentChannel = null;
          }
        }
        setChannels(prev => [...prev, ...parsedChannels]);
      })
      .catch(console.error);
  }, []);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    channels.forEach(c => {
      const cat = c.category?.toUpperCase() || 'GENERAL';
      cats.set(cat, (cats.get(cat) || 0) + 1);
    });
    
    // Sort categories alphabetically
    const sortedCats = Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    return [
      { name: 'ALL', count: channels.length },
      { name: 'FAVOURITES', count: favorites.length },
      { name: 'CHANNELS HISTORY', count: history.length },
      ...sortedCats.map(([name, count]) => ({ name, count }))
    ];
  }, [channels, favorites, history]);

  const filteredChannels = useMemo(() => {
    if (activeCategory === 'ALL') return channels;
    if (activeCategory === 'FAVOURITES') return channels.filter(c => favorites.includes(c.id));
    if (activeCategory === 'CHANNELS HISTORY') return channels.filter(c => history.includes(c.id));
    return channels.filter(c => (c.category?.toUpperCase() || 'GENERAL') === activeCategory);
  }, [channels, activeCategory, favorites, history]);

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    setHistory(prev => {
      const newHistory = [channel.id, ...prev.filter(id => id !== channel.id)].slice(0, 50);
      localStorage.setItem('shahintv-history', JSON.stringify(newHistory));
      return newHistory;
    });
    
    // Auto-close sidebar on mobile/small screens when playing
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleNext = () => {
    if (!selectedChannel) return;
    const idx = filteredChannels.findIndex(c => c.id === selectedChannel.id);
    if (idx >= 0 && idx < filteredChannels.length - 1) {
      handleSelectChannel(filteredChannels[idx + 1]);
    }
  };

  const handlePrev = () => {
    if (!selectedChannel) return;
    const idx = filteredChannels.findIndex(c => c.id === selectedChannel.id);
    if (idx > 0) {
      handleSelectChannel(filteredChannels[idx - 1]);
    }
  };

  return (
    <div className="flex w-full h-screen bg-black text-white overflow-hidden font-sans select-none">
      
      {/* Sidebar Overlay (Categories + Channels) */}
      <div className={\`flex h-full transition-transform duration-300 z-50 \${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} absolute md:relative\`}>
        
        {/* Categories Column */}
        <div className="w-64 bg-black flex flex-col h-full border-r border-gray-900 shadow-2xl">
          <div className="p-4 flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors md:hidden">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <ArrowLeft className="w-5 h-5 hidden md:block text-gray-400" />
            <h1 className="text-lg font-medium">Channels List</h1>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {categories.map(cat => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                className={\`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors \${
                  activeCategory === cat.name 
                    ? 'bg-[#0c7c8c] text-white font-medium' 
                    : 'text-gray-300 hover:bg-white/5 border-b border-gray-900/50'
                }\`}
              >
                <span>{cat.name}</span>
                <span className="text-gray-400 text-xs">{cat.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Channels Column */}
        <div className="w-72 bg-[#0f0f0f] flex flex-col h-full shadow-2xl">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredChannels.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No channels found</div>
            ) : (
              filteredChannels.map(channel => {
                const isSelected = selectedChannel?.id === channel.id;
                return (
                  <button
                    key={channel.id}
                    onClick={() => handleSelectChannel(channel)}
                    className={\`w-full flex items-center gap-3 px-3 py-3 border-b border-gray-800/50 transition-colors text-left \${
                      isSelected ? 'bg-[#0c7c8c]' : 'hover:bg-white/5'
                    }\`}
                  >
                    <div className="w-12 h-10 bg-white/5 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                      {channel.iconUrl ? (
                        <img src={channel.iconUrl} alt={channel.name} className="w-full h-full object-contain" onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }} />
                      ) : (
                        <Tv className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{channel.name}</div>
                      <div className={\`text-xs truncate mt-0.5 \${isSelected ? 'text-white/80' : 'text-gray-400'}\`}>
                        {channel.currentProgram || 'No Program Found'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Main Player Area */}
      <div className="flex-1 relative bg-black flex items-center justify-center h-full">
        {!selectedChannel ? (
          <div className="flex flex-col items-center gap-4 text-gray-500">
            <Tv className="w-16 h-16 opacity-20" />
            <p>Select a channel from the list</p>
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                Open Channels
              </button>
            )}
          </div>
        ) : (
          <Suspense fallback={
            <div className="flex items-center justify-center w-full h-full">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
          }>
            <VideoPlayer
              channel={selectedChannel}
              onNext={handleNext}
              onPrev={handlePrev}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              isSidebarOpen={isSidebarOpen}
            />
          </Suspense>
        )}
      </div>

    </div>
  );
}
`;

fs.writeFileSync('src/App.tsx', appContent);
