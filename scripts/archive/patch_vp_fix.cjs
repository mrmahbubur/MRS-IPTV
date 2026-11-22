const fs = require('fs');
let vp = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

// The issue was I removed AnimatePresence or motion.div properly?
// Wait, the error is:
// 224|            </motion.div>
//    |              ^
// 225|          )}
// 226|        </AnimatePresence>

// Let's check how many <motion.div> are opened and closed.

vp = vp.replace(
  /\{?\/\* Top Bar \*\/\}[\s\S]*?\{?\/\* Error Toast positioned slightly above bottom bar \*\/\}/,
  \`{/* Top Bar */}
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

            {/* Error Toast positioned slightly above bottom bar */}\`
);

fs.writeFileSync('src/components/VideoPlayer.tsx', vp);
