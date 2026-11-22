const fs = require('fs');
let vpContent = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

vpContent = vpContent.replace(
  /<ArrowLeft className="w-5 h-5 text-white" \/>/,
  `{isSidebarOpen ? <ArrowLeft className="w-5 h-5 text-white" /> : <LayoutGrid className="w-5 h-5 text-white" />}`
);

fs.writeFileSync('src/components/VideoPlayer.tsx', vpContent);
