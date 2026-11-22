const fs = require('fs');
let content = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

content = content.replace(/<button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Closed Captions">\s*CC\s*<\/button>\s*<button className="text-white hover:text-orange-500 transition-colors font-bold text-sm tracking-wide" title="Playback Speed">\s*1\.0x\s*<\/button>\s*<button className="text-white hover:text-orange-500 transition-colors" title="Signal Quality">\s*<Signal className="w-5 h-5 lg:w-6 lg:h-6" \/>\s*<\/button>/g, '');

content = content.replace(/<button \n                  onClick=\{.*?\}\n                  className="p-3 bg-white\/10 hover:bg-white\/20 border border-white\/10 rounded-sm transition-colors backdrop-blur-sm shadow-lg"\n                >\n                  <ArrowLeft className="w-5 h-5 text-white" \/>\n                <\/button>/g, '');

fs.writeFileSync('src/components/VideoPlayer.tsx', content);
