const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

const target = /const displayChannels = \[\s*\{ id: 'mock-1'[\s\S]*?\] as any\[\];/;
const replacement = "const liveChannels = channels.filter(c => c.status === 'live' || true);\n  const displayChannels = liveChannels.length > 0 ? liveChannels : channels.slice(0, 15);";

homeContent = homeContent.replace(target, replacement);
fs.writeFileSync('src/components/Home.tsx', homeContent);
