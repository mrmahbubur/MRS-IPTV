const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

const target = /const displayChannels = liveChannels\.length > 0 \? liveChannels : channels\.slice\(0, 15\);/;
const replacement = "const displayChannels = liveChannels.slice(0, 20);";

homeContent = homeContent.replace(target, replacement);
fs.writeFileSync('src/components/Home.tsx', homeContent);
