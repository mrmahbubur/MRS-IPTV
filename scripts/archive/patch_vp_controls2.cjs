const fs = require('fs');
let vp = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

vp = vp.replace(
  /import \{ ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, LayoutGrid, Maximize, Columns, Loader2, MonitorPlay, Volume2, Rewind, FastForward \} from 'lucide-react';/,
  "import { ArrowLeft, Settings, Play, Pause, SkipBack, SkipForward, LayoutGrid, Maximize, Columns, Loader2, MonitorPlay, Volume2, Rewind, FastForward, Tv, Captions, Radio, Signal } from 'lucide-react';"
);

vp = vp.replace(
  /\{hasError && retryCount < 5 && \([\s\S]*?\{hasError && retryCount >= 5 && \([\s\S]*?Stream unavailable\s*<\/div>\s*\)\}/,
  `{hasError && retryCount < 5 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
           <Loader2 className="w-12 h-12 text-white animate-spin opacity-80" />
        </div>
      )}

      {!isPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40 backdrop-blur-sm pointer-events-none">
           <div className="w-24 h-24 bg-orange-500/90 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.6)] mb-4 pointer-events-auto cursor-pointer hover:scale-105 transition-transform" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
             <Play className="w-12 h-12 text-white ml-2" fill="white" />
           </div>
           <span className="text-white text-lg font-medium tracking-wide">Click to Play</span>
        </div>
      )}`
);

vp = vp.replace(
  /\{?\/\* Top Bar \*\/\}[\s\S]*?\{?\/\* Error Toast positioned slightly above bottom bar \*\/\}/,
  `{/* Top Bar */}
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={onToggleSidebar}
                  className="p-3 bg-black/40 hover:bg-black/60 border border-white/10 rounded-sm transition-colors backdrop-blur-sm"
                >
                  {isSidebarOpen ? <ArrowLeft className="w-5 h-5 text-white" /> : <LayoutGrid className="w-5 h-5 text-white" />}
                </button>
                <h2 className="text-lg font-bold text-white shadow-sm uppercase tracking-wider flex items-center gap-3">
                  {channel.iconUrl && (
                    <img src={channel.iconUrl} alt="Logo" className="h-8 w-auto object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  )}
                  {channel.name}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <button className="p-3 bg-black/40 hover:bg-black/60 border border-white/10 rounded-sm transition-colors backdrop-blur-sm" title="Display Options">
                  <MonitorPlay className="w-5 h-5 text-white" />
                </button>
                <button className="p-3 bg-black/40 hover:bg-black/60 border border-white/10 rounded-sm transition-colors backdrop-blur-sm" title="Settings">
                  <Settings className="w-5 h-5 text-white" />
                </button>
                <button className="p-3 bg-black/40 hover:bg-black/60 border border-white/10 rounded-sm transition-colors backdrop-blur-sm" title="Fullscreen">
                  <Maximize className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Error Toast positioned slightly above bottom bar */}`
);

vp = vp.replace(
  /\{?\/\* Bottom Bar \*\/\}[\s\S]*?<\/motion\.div>/,
  `{/* Bottom Bar */}
            <div className="p-6 flex flex-col gap-2">
              
              {/* Progress Line and Time */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white text-xs font-medium w-10 text-right">12:45</span>
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer relative group">
                   <div className="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-colors"></div>
                   <div className="h-full bg-orange-500 w-[30%] shadow-[0_0_10px_rgba(249,115,22,0.8)] relative rounded-full"></div>
                </div>
                <span className="text-gray-400 text-xs font-medium w-10">45:30</span>
              </div>

              {/* Media Controls */}
              <div className="flex items-center justify-between">
                
                {/* Left: Volume & Time Indicator */}
                <div className="flex items-center gap-4 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors">
                    <Volume2 className="w-6 h-6" />
                  </button>
                  <div className="w-24 h-1.5 bg-white/20 rounded-full hidden sm:block cursor-pointer overflow-hidden group">
                    <div className="h-full bg-white group-hover:bg-orange-500 transition-colors w-[80%] rounded-full" />
                  </div>
                </div>

                {/* Center: Playback */}
                <div className="flex items-center justify-center gap-6 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Rewind">
                    <Rewind className="w-7 h-7" fill="currentColor" />
                  </button>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    className="w-14 h-14 bg-transparent border-2 border-white/50 hover:border-orange-500 hover:text-orange-500 rounded-full flex items-center justify-center transition-all text-white"
                  >
                    {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-1" fill="currentColor" />}
                  </button>
                  
                  <button className="text-white hover:text-orange-500 transition-colors hover:scale-110 active:scale-95 transform" title="Fast Forward">
                    <FastForward className="w-7 h-7" fill="currentColor" />
                  </button>
                </div>

                {/* Right: CC, Speed, Signal */}
                <div className="flex items-center justify-end gap-6 w-1/3">
                  <button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Closed Captions">
                    CC
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Playback Speed">
                    1.0x
                  </button>
                  <button className="text-white hover:text-orange-500 transition-colors" title="Signal Quality">
                    <Signal className="w-5 h-5" />
                  </button>
                  <button onClick={onToggleSidebar} className={\`hidden sm:flex items-center gap-2 hover:text-orange-500 transition-colors ml-2 \${isSidebarOpen ? 'text-orange-400' : 'text-white'}\`} title="Channel List">
                    <LayoutGrid className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Show current program under controls briefly */}
              {channel.currentProgram && channel.currentProgram !== 'No Program Found' && (
                <div className="absolute bottom-24 left-6 text-sm text-gray-300 font-medium">
                  Playing: <span className="text-white font-bold">{channel.currentProgram}</span>
                </div>
              )}
            </div>
          </motion.div>`
);

fs.writeFileSync('src/components/VideoPlayer.tsx', vp);
