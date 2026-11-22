const fs = require('fs');
let vp = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

const regex = /<AnimatePresence>[\s\S]*?<\/AnimatePresence>/;
vp = vp.replace(regex, `<AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/80"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={onToggleSidebar}
                  className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg"
                >
                  {isSidebarOpen ? <ArrowLeft className="w-5 h-5 text-white" /> : <LayoutGrid className="w-5 h-5 text-white" />}
                </button>
                <h2 className="text-lg font-bold text-white shadow-sm uppercase tracking-wider flex items-center gap-3">
                  {channel.iconUrl && (
                    <img src={channel.iconUrl} alt="Logo" className="h-8 w-auto object-contain drop-shadow-md" onError={(e) => e.currentTarget.style.display = 'none'} />
                  )}
                  {channel.name}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <button className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Display Options">
                  <MonitorPlay className="w-5 h-5 text-white" />
                </button>
                <button className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Settings">
                  <Settings className="w-5 h-5 text-white" />
                </button>
                <button className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg" title="Fullscreen">
                  <Maximize className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {hasError && retryCount < 5 && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-gray-200 text-gray-900 px-6 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-2xl">
                <MonitorPlay className="w-4 h-4 text-blue-600" />
                Playback error, reconnects in 3s ({retryCount}/5)
              </div>
            )}
            
            {hasError && retryCount >= 5 && (
               <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full text-sm font-medium shadow-2xl">
                Stream unavailable
              </div>
            )}

            {/* Bottom Bar */}
            <div className="p-6 flex flex-col gap-2">
              
              {/* Progress Line and Time */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white text-xs font-medium w-12 text-right">12:45</span>
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer relative group">
                   <div className="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-colors"></div>
                   <div className="h-full bg-orange-500 w-[30%] shadow-[0_0_10px_rgba(249,115,22,0.8)] relative rounded-full"></div>
                </div>
                <span className="text-gray-400 text-xs font-medium w-12">45:30</span>
              </div>

              {/* Media Controls */}
              <div className="flex items-center justify-between">
                
                {/* Left: Volume */}
                <div className="flex items-center gap-4 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors">
                    <Volume2 className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                  <div className="w-20 lg:w-24 h-1.5 bg-white/20 rounded-full hidden sm:block cursor-pointer overflow-hidden group">
                    <div className="h-full bg-white group-hover:bg-orange-500 transition-colors w-[80%] rounded-full" />
                  </div>
                </div>

                {/* Center: Playback */}
                <div className="flex items-center justify-center gap-4 lg:gap-6 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Rewind">
                    <Rewind className="w-6 h-6 lg:w-7 lg:h-7" fill="currentColor" />
                  </button>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    className="w-12 h-12 lg:w-14 lg:h-14 bg-transparent border-2 border-white/50 hover:border-orange-500 hover:text-orange-500 rounded-full flex items-center justify-center transition-all text-white"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 lg:w-6 lg:h-6" fill="currentColor" /> : <Play className="w-5 h-5 lg:w-6 lg:h-6 ml-1" fill="currentColor" />}
                  </button>
                  
                  <button className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Fast Forward">
                    <FastForward className="w-6 h-6 lg:w-7 lg:h-7" fill="currentColor" />
                  </button>
                </div>

                {/* Right: CC, Speed, Signal */}
                <div className="flex items-center justify-end gap-4 lg:gap-6 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Closed Captions">
                    CC
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Playback Speed">
                    1.0x
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors" title="Signal Quality">
                    <Signal className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                  <button onClick={onToggleSidebar} className={\`hidden sm:flex items-center gap-2 hover:text-orange-500 transition-colors ml-2 \${isSidebarOpen ? 'text-orange-400' : 'text-white'}\`} title="Channel List">
                    <LayoutGrid className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>`);

fs.writeFileSync('src/components/VideoPlayer.tsx', vp);
