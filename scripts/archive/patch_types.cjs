const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');
content = content.replace(/icon\?: string;/, 'icon?: string;\n  iconUrl?: string;');
fs.writeFileSync('src/types.ts', content);
