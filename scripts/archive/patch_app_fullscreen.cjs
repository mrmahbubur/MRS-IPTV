const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const handleSelectChannel = \(channel: Channel\) => \{\n    setSelectedChannel\(channel\);\n  \};/, `const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    setTimeout(() => {
      const playerContainer = document.getElementById('player-container');
      if (playerContainer && playerContainer.requestFullscreen) {
        playerContainer.requestFullscreen().catch(() => {});
      }
    }, 100);
  };`);

content = content.replace(/<div className="flex-1 w-full h-full relative">/, `<div id="player-container" className="flex-1 w-full h-full relative bg-black">`);

fs.writeFileSync('src/App.tsx', content);
