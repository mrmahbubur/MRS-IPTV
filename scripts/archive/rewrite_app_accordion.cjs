const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// We will overwrite App.tsx entirely.
appContent = `import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { Tv, Search, ArrowLeft, Loader2, ChevronDown, ChevronRight, Menu } from 'lucide-react';
import { Channel } from './types';
import { lazy } from 'react';
import { FIFA_CHANNELS } from './data/fifaChannels';
import { EXTRA_CHANNELS } from './data/extraChannels';

const VideoPlayer = lazy(() => import('./components/VideoPlayer'));

const INITIAL_CHANNELS: Channel[] = [
  ...EXTRA_CHANNELS,
  ...FIFA_CHANNELS
];

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(
    INITIAL_CHANNELS.find(c => c.id === 'chan-cctv-5') || INITIAL_CHANNELS[0] || null
  );
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  
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
        setChannels(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const uniqueNewChannels = parsedChannels.filter(c => !existingIds.has(c.id));
          return [...prev, ...uniqueNewChannels];
        });
      })
      .catch(console.error);
  }, []);

  const categories = useMemo(() => {
    const cats = new Map<string, Channel[]>();
    channels.forEach(c => {
      const catName = c.category?.toUpperCase() || 'GENERAL';
      if (!cats.has(catName)) {
        cats.set(catName, []);
      }
      cats.get(catName)!.push(c);
    });
    
    // Sort categories alphabetically
    const sortedCats = Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    return sortedCats.map(([name, channels]) => ({ name, channels }));
  }, [channels]);

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    // Auto-close sidebar on mobile screens when playing
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleNext = () => {
    if (!selectedChannel) return;
    const currentCat = categories.find(cat => cat.channels.some(c => c.id === selectedChannel.id));
    if (currentCat) {
      const idx = currentCat.channels.findIndex(c => c.id === selectedChannel.id);
      if (idx >= 0 && idx < currentCat.channels.length - 1) {
        handleSelectChannel(currentCat.channels[idx + 1]);
      }
    }
  };

  const handlePrev = () => {
    if (!selectedChannel) return;
    const currentCat = categories.find(cat => cat.channels.some(c => c.id === selectedChannel.id));
    if (currentCat) {
      const idx = currentCat.channels.findIndex(c => c.id === selectedChannel.id);
      if (idx > 0) {
        handleSelectChannel(currentCat.channels[idx - 1]);
      }
    }
  };

  const toggleCategory = (catName: string) => {
    setExpandedCategory(prev => prev === catName ? null : catName);
  };

  return (
    <div className="flex w-full h-screen bg-black text-white overflow-hidden font-sans select-none relative">
      
      {/* Sidebar Overlay */}
      <div className={\`flex h-full transition-transform duration-300 z-50 \${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} absolute top-0 left-0 bottom-0\`}>
        
        {/* Accordion Sidebar */}
        <div className="w-72 sm:w-80 bg-black flex flex-col h-full border-r border-gray-900 shadow-2xl">
          <div className="p-4 flex items-center justify-between border-b border-gray-900">
            <h1 className="text-lg font-medium text-white flex items-center gap-2">
              <Tv className="w-5 h-5 text-lime-500" /> Channels
            </h1>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {categories.map(cat => {
              const isExpanded = expandedCategory === cat.name;
              return (
                <div key={cat.name} className="mb-1">
                  <button
                    onClick={() => toggleCategory(cat.name)}
                    className={\`w-full flex items-center justify-between px-3 py-3 text-sm rounded-lg transition-colors \${
                      isExpanded 
                        ? 'bg-[#0c7c8c]/20 text-[#0c7c8c] font-bold' 
                        : 'text-gray-300 hover:bg-white/5'
                    }\`}
                  >
                    <span className="truncate">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs bg-gray-900 px-2 py-0.5 rounded-full">{cat.channels.length}</span>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="mt-1 pl-2 pr-1 space-y-1">
                      {cat.channels.map(channel => {
                        const isSelected = selectedChannel?.id === channel.id;
                        return (
                          <button
                            key={channel.id}
                            onClick={() => handleSelectChannel(channel)}
                            className={\`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left \${
                              isSelected ? 'bg-[#0c7c8c] text-white' : 'hover:bg-white/5 text-gray-400'
                            }\`}
                          >
                            <div className="w-8 h-6 bg-black/40 rounded flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-800">
                              {channel.iconUrl ? (
                                <img src={channel.iconUrl} alt={channel.name} className="w-full h-full object-contain" onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }} />
                              ) : (
                                <Tv className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={\`text-xs font-medium truncate \${isSelected ? 'text-white' : 'text-gray-300'}\`}>{channel.name}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Player Area */}
      <div className="flex-1 relative bg-black flex flex-col h-full overflow-hidden w-full">
        {/* Top Header to trigger sidebar if closed */}
        {!isSidebarOpen && (
          <div className="absolute top-4 left-4 z-40">
             <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-3 bg-black/50 hover:bg-black/80 border border-white/10 rounded-full text-white transition-all backdrop-blur-md shadow-lg"
              >
                <Menu className="w-5 h-5" />
              </button>
          </div>
        )}

        {!selectedChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500">
            <Tv className="w-16 h-16 opacity-20" />
            <p>Select a channel from the list</p>
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
