const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const hwBackLogic = `  const [backPressCount, setBackPressCount] = useState(0);

  useEffect(() => {
    if (selectedChannel) {
      window.history.pushState({ playerOpen: true }, '');
      
      const handlePopState = (e) => {
        setBackPressCount(prev => {
          if (prev === 0) {
            window.history.pushState({ playerOpen: true }, '');
            setTimeout(() => setBackPressCount(0), 3000);
            return 1;
          } else {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
            }
            setSelectedChannel(null);
            return 0;
          }
        });
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [selectedChannel]);
`;

content = content.replace(/export default function App\(\) \{\n\s*const \[channels, setChannels\] = useState<Channel\[\]>\(\[\]\);\n\s*const \[selectedChannel, setSelectedChannel\] = useState<Channel \| null>\(null\);\n\s*const \[searchQuery, setSearchQuery\] = useState\(''\);\n\s*const \[activeView, setActiveView\] = useState\('home'\);\n\s*const \[favorites, setFavorites\] = useState<string\[\]>\(\[\]\);\n\s*const \[isMobileMenuOpen, setIsMobileMenuOpen\] = useState\(false\);/, `export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState('home');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

${hwBackLogic}`);

const toastLogic = `
            {backPressCount === 1 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-6 py-2 rounded-full text-sm font-medium shadow-2xl transition-all">
                Press back again to exit
              </div>
            )}
            <DoubleClickBackButton onBack={() => {`;

content = content.replace(/<DoubleClickBackButton onBack=\{\(\) => \{/, toastLogic);

fs.writeFileSync('src/App.tsx', content);
