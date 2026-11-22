const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Allow selectedChannel to be null
content = content.replace(
  /const \[selectedChannel, setSelectedChannel\] = useState<Channel>\(INITIAL_CHANNELS\[1\]\);/,
  `const [selectedChannel, setSelectedChannel] = useState<Channel | null>(INITIAL_CHANNELS[1]);`
);

// We need to implement handleNext, handlePrev, handleStop
content = content.replace(
  /const handleSelectChannel = \(channel: Channel\) => \{/,
  `const handleStop = () => {
    setSelectedChannel(null);
  };

  const getFilteredChannels = () => {
    return channels
      .filter((c) => {
        if (filterTab === 'all') return true;
        if (filterTab === 'favorites') return favorites.includes(c.id);
        return c.category === filterTab;
      })
      .slice(0, 100)
      .sort((a, b) => (a.status === 'live' ? -1 : 1) - (b.status === 'live' ? -1 : 1));
  };

  const handleNext = () => {
    if (!selectedChannel) return;
    const list = getFilteredChannels();
    const idx = list.findIndex(c => c.id === selectedChannel.id);
    if (idx >= 0 && idx < list.length - 1) {
      handleSelectChannel(list[idx + 1]);
    }
  };

  const handlePrev = () => {
    if (!selectedChannel) return;
    const list = getFilteredChannels();
    const idx = list.findIndex(c => c.id === selectedChannel.id);
    if (idx > 0) {
      handleSelectChannel(list[idx - 1]);
    }
  };

  const handleSelectChannel = (channel: Channel) => {`
);

// Change the layout
const oldMainPattern = /\{\/\* Main Content Area \*\/\}\s*<main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 overflow-y-auto">[\s\S]*?\{\/\* Footer info bars \*\/\}/;
const newMainContent = `{/* Main Content Area */}
        <main className="flex-1 w-full p-4 lg:p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full flex flex-col-reverse lg:flex-row gap-6">
            
            {/* Left Column: Channel List */}
            <div className="w-full lg:w-1/3 flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-sm">
                <div className="grid grid-cols-3 gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200 mb-4">
                  <button onClick={() => setFilterTab('all')} className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'all' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}>ALL</button>
                  <button onClick={() => setFilterTab('favorites')} className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'favorites' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}><Heart size={12} className={filterTab === 'favorites' ? 'text-emerald-950 fill-emerald-950' : ''} />FAVS</button>
                  <button onClick={() => setFilterTab('sports')} className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'sports' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}>SPORTS</button>
                  <button onClick={() => setFilterTab('news')} className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'news' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}>NEWS</button>
                  <button onClick={() => setFilterTab('movies')} className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'movies' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}>MOVIES</button>
                  <button onClick={() => setFilterTab('country')} className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'country' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}>COUNTRY</button>
                </div>

                <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                  {getFilteredChannels().map((channel) => {
                    const isSelected = selectedChannel?.id === channel.id;
                    const isFav = favorites.includes(channel.id);
                    return (
                      <button
                        key={channel.id}
                        onClick={() => handleSelectChannel(channel)}
                        className={\`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-300 group cursor-pointer relative \${isSelected ? 'bg-lime-50 border-lime-500' : 'bg-gray-50 hover:bg-gray-100 border-gray-100 hover:border-lime-500/30'}\`}
                      >
                        <span className="text-2xl w-11 h-11 bg-white text-gray-900 rounded-lg border border-gray-200 group-hover:border-gray-300 transition-all flex items-center justify-center flex-shrink-0 relative overflow-hidden group-hover:scale-105">
                          <Play className="w-5 h-5 text-lime-500 fill-lime-500/80 group-hover:scale-110 transition-transform" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[8.5px] uppercase font-mono font-black tracking-widest text-gray-400 group-hover:text-lime-400 transition-colors">
                              {channel.category}
                            </span>
                            <div className="flex items-center gap-2">
                              <div onClick={(e) => toggleFavorite(e, channel.id)} className="text-gray-400 hover:text-amber-500 transition-colors z-10">
                                <Heart size={12} className={isFav ? "fill-amber-500 text-amber-500" : ""} />
                              </div>
                              <span className="flex items-center gap-0.5 text-[8px] font-extrabold text-amber-400 bg-amber-500/5 px-1.5 py-0.5 rounded-full border border-amber-500/10">
                                {(channel.viewersCount / 1000).toFixed(0)}k watching
                              </span>
                            </div>
                          </div>
                          <h4 className="text-xs font-black text-gray-900 group-hover:text-gray-900 truncate transition-colors mt-0.5 pr-6">
                            {channel.name}
                          </h4>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Player & Info */}
            <div className="w-full lg:w-2/3 flex flex-col gap-4 lg:sticky lg:top-4 h-fit">
              {selectedChannel ? (
                <>
                  <div className="w-full flex justify-center mb-2">
                    <Suspense fallback={
                      <div className="w-full aspect-video bg-gray-900 rounded-2xl animate-pulse flex items-center justify-center border-4 border-gray-200">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-12 h-12 border-4 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading TV Engine</p>
                        </div>
                      </div>
                    }>
                      <VideoPlayer 
                        channel={selectedChannel} 
                        floatingReactions={floatingReactions} 
                        onAddReaction={handleReaction}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        onStop={handleStop}
                      />
                    </Suspense>
                  </div>

                  <div className="bg-white text-gray-900 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border border-gray-200 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-lime-500"></div>
                    <div className="flex items-center gap-3 md:gap-4 pl-2 relative z-10">
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center shadow-inner flex-shrink-0">
                        <Play className="w-6 h-6 text-lime-500 fill-lime-500/80" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm md:text-base font-extrabold text-gray-900 tracking-wide">
                            {selectedChannel.name}
                          </h2>
                          <span className="text-[9px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded font-mono">
                            {selectedChannel.category.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 font-medium">
                          Current: <span className="text-gray-900">{selectedChannel.currentProgram}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full aspect-video bg-gray-100 rounded-2xl flex items-center justify-center border-4 border-gray-200 flex-col gap-4 shadow-inner text-gray-400">
                  <Tv className="w-16 h-16 opacity-50" />
                  <p className="font-bold tracking-widest uppercase text-sm">Select a channel to watch</p>
                </div>
              )}
            </div>

          </div>
        </main>

        {/* Footer info bars */}`;

content = content.replace(oldMainPattern, newMainContent);

// One tiny detail: remove `import { Radio } from 'lucide-react';` if we removed it, but we can leave it.

fs.writeFileSync('src/App.tsx', content);
