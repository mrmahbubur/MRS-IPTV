const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/<button \n              onClick=\{.*?\}\n              className="absolute top-4 left-4 z-50 bg-black\/50 hover:bg-black\/80 text-white px-4 py-2 rounded-lg backdrop-blur-md border border-white\/10 flex items-center gap-2 transition-colors"\n            >/s, `<button 
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                setSelectedChannel(null);
              }}
              className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/80 text-white px-4 py-2 rounded-lg backdrop-blur-md border border-white/10 flex items-center gap-2 transition-colors"
            >`);

fs.writeFileSync('src/App.tsx', content);
