const fs = require('fs');
let vp = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

vp = vp.replace(
  /import \{ ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, LayoutGrid, Maximize, Columns, Loader2, MonitorPlay \} from 'lucide-react';/,
  "import { ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, LayoutGrid, Maximize, Columns, Loader2, MonitorPlay, Volume2, Rewind, FastForward } from 'lucide-react';"
);

vp = vp.replace(
  /\{?\/\* Bottom Bar \*\/\}[\s\S]*?<\/motion\.div>/,
  `{/* Bottom Bar */}
            <div className="p-6 flex flex-col gap-4">
              
              {/* Channel Info */}
              <div className="flex items-center gap-3">
                {channel.iconUrl && (
                  <div className="w-12 h-10 bg-white/10 rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                    <img src={channel.iconUrl} alt="Logo" className="max-w-full max-h-full object-contain" onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}/>
                  </div>
                )}
                <div className="flex flex-col">
                  <div className="text-sm font-bold text-white">{channel.name}</div>
                  <div className="text-sm text-gray-300">Now: {channel.currentProgram || 'No Program Found'}</div>
                  <div className="text-xs text-gray-400">Next: {channel.nextProgram || 'No Program Found'}</div>
                </div>
              </div>

              {/* Progress Line */}
              <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer relative mt-2">
                 <div className="h-full bg-orange-500 w-[95%] shadow-[0_0_10px_rgba(249,115,22,0.8)] relative"></div>
              </div>

              {/* Media Controls */}
              <div className="flex items-center justify-between mt-2">
                {/* Left: Volume */}
                <div className="flex items-center gap-4 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors">
                    <Volume2 className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                  <div className="w-24 h-1 bg-white/20 rounded-full hidden sm:block cursor-pointer overflow-hidden">
                    <div className="h-full bg-white w-[80%] rounded-full" />
                  </div>
                </div>

                {/* Center: Playback */}
                <div className="flex items-center justify-center gap-6 w-1/3">
                  <button onClick={onPrev} className="text-white hover:text-orange-500 transition-colors" title="Previous Channel">
                    <SkipBack className="w-4 h-4 lg:w-5 lg:h-5" />
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors">
                    <Rewind className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="w-12 h-12 lg:w-14 lg:h-14 bg-orange-500 hover:bg-orange-400 rounded-full flex items-center justify-center transition-colors text-white shadow-[0_0_15px_rgba(249,115,22,0.5)]"
                  >
                    {isPlaying ? <Pause className="w-6 h-6 lg:w-7 lg:h-7" /> : <Play className="w-6 h-6 lg:w-7 lg:h-7 ml-1" />}
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors">
                    <FastForward className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                  <button onClick={onNext} className="text-white hover:text-orange-500 transition-colors" title="Next Channel">
                    <SkipForward className="w-4 h-4 lg:w-5 lg:h-5" />
                  </button>
                </div>

                {/* Right: Fullscreen */}
                <div className="flex items-center justify-end gap-6 w-1/3">
                  <button onClick={onToggleSidebar} className={\`hidden sm:flex items-center gap-2 hover:text-orange-500 transition-colors \${isSidebarOpen ? 'text-orange-400' : 'text-white'}\`}>
                    <LayoutGrid className="w-5 h-5" />
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors">
                    <Maximize className="w-5 h-5 lg:w-6 lg:h-6" />
                  </button>
                </div>
              </div>

            </div>
          </motion.div>`
);

fs.writeFileSync('src/components/VideoPlayer.tsx', vp);
