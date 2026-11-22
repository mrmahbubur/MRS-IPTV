const fs = require('fs');
let content = fs.readFileSync('src/components/HlsPlayer.tsx', 'utf8');
content = content.replace(/  \);\n\};\n\nHlsPlayer\.displayName = 'HlsPlayer';/, `  );\n});\n\nHlsPlayer.displayName = 'HlsPlayer';`);
fs.writeFileSync('src/components/HlsPlayer.tsx', content);
