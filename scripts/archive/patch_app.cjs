const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Add states for search and mobile menu
appContent = appContent.replace(
  /const \[selectedChannel, setSelectedChannel\] = useState<Channel \| null>\(null\);/,
  `const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);`
);

// Update TopHeader props
appContent = appContent.replace(
  /{!selectedChannel && <TopHeader \/>}/,
  `{!selectedChannel && <TopHeader 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          isMobileMenuOpen={isMobileMenuOpen} 
          setIsMobileMenuOpen={setIsMobileMenuOpen} 
        />}`
);

// Update Home props
appContent = appContent.replace(
  /<Home channels=\{channels\} onSelectChannel=\{handleSelectChannel\} \/>/,
  `<Home channels={channels} onSelectChannel={handleSelectChannel} searchQuery={searchQuery} />`
);

// Update Sidebar to receive isMobileMenuOpen to show on mobile
appContent = appContent.replace(
  /{!selectedChannel && <Sidebar \/>}/,
  `{!selectedChannel && <Sidebar isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={() => setIsMobileMenuOpen(false)} />}`
);

fs.writeFileSync('src/App.tsx', appContent);
