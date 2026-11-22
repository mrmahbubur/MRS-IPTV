const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const handleSelectChannel = \(channel: Channel\) => \{\n\s*setSelectedChannel\(channel\);\n\s*setTimeout\(\(\) => \{\n\s*const playerContainer = document\.getElementById\('player-container'\);\n\s*if \(playerContainer && playerContainer\.requestFullscreen\) \{\n\s*playerContainer\.requestFullscreen\(\)\.catch\(\(\) => \{\}\);\n\s*\}\n\s*\}, 100\);\n\s*\};/, `const handleSelectChannel = (channel: Channel) => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    setSelectedChannel(channel);
  };`);

content = content.replace(/<button \n\s*onClick=\{\(\) => \{\n\s*if \(document\.fullscreenElement\) \{\n\s*document\.exitFullscreen\(\)\.catch\(\(\) => \{\}\);\n\s*\}\n\s*setSelectedChannel\(null\);\n\s*\}\}/, `<button 
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                setSelectedChannel(null);
              }}`);

fs.writeFileSync('src/App.tsx', content);
