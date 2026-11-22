const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

const panelsHtml = `
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 h-24 flex-shrink-0">
              {[
                { title: 'INFORMATION', icon: 'ℹ️' },
                { title: 'DONATE', icon: '💲' },
                { title: 'RULES', icon: '📋' },
                { title: 'LINKS', icon: '🔗' },
              ].map((panel) => (
                <div key={panel.title} className="bg-[#0a0303]/80 border-[2px] border-red-800/60 shadow-[0_0_15px_rgba(220,38,38,0.2)] backdrop-blur flex items-center justify-center gap-3 rounded-lg overflow-hidden relative group cursor-pointer hover:border-red-500 hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-all">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-400"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-400 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-red-400 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  <span className="text-2xl drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]">{panel.icon}</span>
                  <span className="text-red-50 font-bold tracking-widest text-shadow-red">{panel.title}</span>
                </div>
              ))}
            </div>
`;

// Wrap VideoPlayer in a flex container that takes remaining space
appContent = appContent.replace(
  /<VideoPlayer\s+channel={selectedChannel}\s+onNext={handleNext}\s+onPrev={handlePrev}\s+onToggleSidebar=\{\(\) => setIsSidebarOpen\(!isSidebarOpen\)\}\s+isSidebarOpen={isSidebarOpen}\s+\/>/,
  `<div className="flex-1 min-h-0 relative">
              <VideoPlayer
                channel={selectedChannel}
                onNext={handleNext}
                onPrev={handlePrev}
                onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                isSidebarOpen={isSidebarOpen}
              />
            </div>
            ${panelsHtml}`
);

fs.writeFileSync('src/App.tsx', appContent);
