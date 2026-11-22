const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

homeContent = homeContent.replace(
  /const liveChannels = channels\.filter\(c => c\.category === 'SPORTS'\)\.slice\(0, 5\);\n/g,
  ''
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
