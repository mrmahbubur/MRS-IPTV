const fs = require('fs');
let content = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');
content = content.replace(/const container = document\.getElementById\('player-container'\);\n\s*if \(!document\.fullscreenElement && container\) \{\n\s*container\.requestFullscreen\(\)\.catch\(\(\) => \{\}\);\n\s*\} else if \(document\.exitFullscreen\) \{\n\s*document\.exitFullscreen\(\);\n\s*\}/, `if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }`);
fs.writeFileSync('src/components/VideoPlayer.tsx', content);
