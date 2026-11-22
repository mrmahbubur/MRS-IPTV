const fs = require('fs');

// Fix App.tsx
let appContent = fs.readFileSync('src/App.tsx', 'utf8');
appContent = appContent.replace(
  /import \{ Search, ArrowLeft/,
  "import { Tv, Search, ArrowLeft"
);
fs.writeFileSync('src/App.tsx', appContent);

// Fix VideoPlayer.tsx
let vpContent = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');
vpContent = vpContent.replace(
  /const controlsTimeoutRef = useRef<NodeJS.Timeout>\(\);/,
  "const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);"
);
fs.writeFileSync('src/components/VideoPlayer.tsx', vpContent);
