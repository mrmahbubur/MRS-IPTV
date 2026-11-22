const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/setSelectedChannel\(null\);\n\s*setActiveView\('home'\);/g, `setSelectedChannel(null);`);
fs.writeFileSync('src/App.tsx', content);
