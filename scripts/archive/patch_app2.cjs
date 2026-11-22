const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

appContent = appContent.replace(
  /const \[searchQuery, setSearchQuery\] = useState\(''\);/,
  `const [searchQuery, setSearchQuery] = useState('');\n  const [activeView, setActiveView] = useState('home');\n  const [favorites, setFavorites] = useState<string[]>([]);`
);

appContent = appContent.replace(
  /\{\!selectedChannel && <Sidebar isMobileMenuOpen=\{isMobileMenuOpen\} onCloseMobileMenu=\{\(\) => setIsMobileMenuOpen\(false\)\} \/>\}/,
  `{!selectedChannel && <Sidebar isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={() => setIsMobileMenuOpen(false)} activeView={activeView} setActiveView={setActiveView} />}`
);

appContent = appContent.replace(
  /\{\!selectedChannel && <BottomNav \/>\}/,
  `{!selectedChannel && <BottomNav activeView={activeView} setActiveView={setActiveView} />}`
);

appContent = appContent.replace(
  /<Home channels=\{channels\} onSelectChannel=\{handleSelectChannel\} searchQuery=\{searchQuery\} \/>/,
  `<Home channels={channels} onSelectChannel={handleSelectChannel} searchQuery={searchQuery} activeView={activeView} setActiveView={setActiveView} favorites={favorites} setFavorites={setFavorites} />`
);

fs.writeFileSync('src/App.tsx', appContent);
