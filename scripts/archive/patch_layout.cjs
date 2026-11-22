const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace everything from {/* Primary Multi-grid responsive Layout */} to {/* Footer info bars */}
const startIndex = content.indexOf('{/* Primary Multi-grid responsive Layout */}');
const endIndex = content.indexOf('{/* Footer info bars */}');

if (startIndex > -1 && endIndex > -1) {
  const newLayout = `{/* Primary Multi-grid responsive Layout */}
        <div className="flex-1 px-4 py-4 max-w-[1600px] mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
            
            {/* Right Column: Player (Comes first on mobile, right on desktop) */}
            <div className="lg:col-span-8 xl:col-span-9 lg:order-last sticky top-[72px] z-20 space-y-4">
              {selectedChannel ? (
                <>
                  <div className="w-full flex justify-center shadow-2xl rounded-2xl overflow-hidden">
                    <Suspense fallback={<div className="w-full aspect-video bg-black flex items-center justify-center border-4 border-gray-200"><div className="w-8 h-8 rounded-full border-4 border-lime-500/30 border-t-lime-500 animate-spin"></div></div>}>
                      <VideoPlayer
                        channel={selectedChannel}
                        floatingReactions={floatingReactions}
                        onAddReaction={handleAddReaction}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        onStop={handleStop}
                      />
                    </Suspense>
                  </div>
                  
                  {/* Dynamic Broadcast details under player */}
                  <div className="bg-white text-gray-900 rounded-2xl p-4 md:p-5 border border-gray-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 bg-gray-100 rounded-2xl border border-gray-200 flex items-center justify-center shadow-inner flex-shrink-0">
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

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right font-mono">
                        <p className="text-[10px] text-gray-400">PROVIDER</p>
                        <p className="text-xs text-lime-400 font-bold">{selectedChannel.provider}</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full aspect-video bg-gray-100/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border-4 border-gray-200/50 flex-col gap-4 shadow-inner text-white">
                  <Tv className="w-16 h-16 opacity-50" />
                  <p className="font-bold tracking-widest uppercase text-sm">Select a channel to watch</p>
                </div>
              )}
            </div>

            {/* Left Column: Channel List */}
            <div className="lg:col-span-4 xl:col-span-3 lg:order-first flex flex-col h-[70vh] lg:h-[calc(100vh-100px)] lg:sticky lg:top-[72px] bg-white text-gray-900 rounded-2xl p-4 border border-gray-200 shadow-xl self-start overflow-hidden">
              <div className="relative mb-3 flex-shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200 mb-4 flex-shrink-0">
                <button
                  onClick={() => setFilterTab('all')}
                  className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'all' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}
                >
                  ALL
                </button>
                <button
                  onClick={() => setFilterTab('favorites')}
                  className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'favorites' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}
                >
                  <Heart size={12} className={filterTab === 'favorites' ? 'text-emerald-950 fill-emerald-950' : ''} />
                  FAVS
                </button>
                <button
                  onClick={() => setFilterTab('sports')}
                  className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'sports' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}
                >
                  SPORTS
                </button>
                <button
                  onClick={() => setFilterTab('news')}
                  className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'news' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}
                >
                  NEWS
                </button>
                <button
                  onClick={() => setFilterTab('movies')}
                  className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'movies' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}
                >
                  MOVIES
                </button>
                <button
                  onClick={() => setFilterTab('country')}
                  className={\`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-wider transition-all \${filterTab === 'country' ? 'bg-lime-500 text-emerald-950 shadow-md shadow-lime-500/10' : 'text-gray-400 hover:text-gray-700'}\`}
                >
                  COUNTRY
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                {getFilteredChannels().map((channel) => {
                  const isSelected = selectedChannel?.id === channel.id;
                  const isFav = favorites.includes(channel.id);
                  return (
                    <button
                      key={channel.id}
                      onClick={() => handleSelectChannel(channel)}
                      className={\`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-300 group cursor-pointer relative \${
                        isSelected
                          ? 'bg-lime-500/10 border-lime-500 shadow-lg shadow-lime-950/20'
                          : 'bg-gray-50 hover:bg-gray-100 border-gray-100 hover:border-lime-500/30'
                      }\`}
                    >
                      <span className="text-2xl w-10 h-10 bg-white text-gray-900 rounded-lg border border-gray-200 group-hover:border-gray-300 transition-all flex items-center justify-center flex-shrink-0 relative overflow-hidden group-hover:scale-105">
                        <Play className="w-4 h-4 text-lime-500 fill-lime-500/80 group-hover:scale-110 transition-transform" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[8.5px] uppercase font-mono font-black tracking-widest text-gray-400 group-hover:text-lime-400 transition-colors">
                            {channel.category}
                          </span>
                          <div className="flex items-center gap-2">
                            <div
                               onClick={(e) => toggleFavorite(e, channel.id)}
                              className="text-gray-400 hover:text-amber-500 transition-colors z-10"
                            >
                              <Heart size={12} className={isFav ? "fill-amber-500 text-amber-500" : ""} />
                            </div>
                          </div>
                        </div>
                        <h4 className="text-xs font-black text-gray-900 group-hover:text-gray-900 truncate transition-colors mt-0.5">
                          {channel.name}
                        </h4>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        `;
  
  content = content.substring(0, startIndex) + newLayout + content.substring(endIndex);
  fs.writeFileSync('src/App.tsx', content);
} else {
  console.log("Could not find boundaries");
}
