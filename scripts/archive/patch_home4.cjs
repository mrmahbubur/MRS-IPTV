const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

homeContent = homeContent.replace(
  /\{ name: 'Documentary', color: 'from-slate-700 to-slate-900', icon: Globe \},\s*/g,
  ''
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
