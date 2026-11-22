const fs = require('fs');
let content = fs.readFileSync('src/components/BottomNav.tsx', 'utf8');
content = content.replace(/Heart/g, 'Star');
fs.writeFileSync('src/components/BottomNav.tsx', content);
