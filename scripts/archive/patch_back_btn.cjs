const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// replace the button with a DoubleClickBackButton component
if (!content.includes('const DoubleClickBackButton')) {
  content = content.replace(/export default function App\(\) \{/, `const DoubleClickBackButton = ({ onBack }) => {
  const [clickedOnce, setClickedOnce] = useState(false);
  return (
    <button 
      onClick={() => {
        if (!clickedOnce) {
          setClickedOnce(true);
          setTimeout(() => setClickedOnce(false), 3000);
        } else {
          onBack();
        }
      }}
      className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/80 text-white px-4 py-2 rounded-lg backdrop-blur-md border border-white/10 flex items-center gap-2 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      {clickedOnce ? "Click again to confirm" : "Back to Home"}
    </button>
  );
};

export default function App() {`);

  content = content.replace(/<button \n\s*onClick=\{\(\) => \{\n\s*if \(document\.fullscreenElement\) \{\n\s*document\.exitFullscreen\(\)\.catch\(\(\) => \{\}\);\n\s*\}\n\s*setSelectedChannel\(null\);\n\s*\}\}\n\s*className="absolute top-4 left-4 z-50 bg-black\/50 hover:bg-black\/80 text-white px-4 py-2 rounded-lg backdrop-blur-md border border-white\/10 flex items-center gap-2 transition-colors"\n\s*>\n\s*<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"\/><\/svg>\n\s*Back to Home\n\s*<\/button>/, `<DoubleClickBackButton onBack={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                setSelectedChannel(null);
              }} />`);
}

fs.writeFileSync('src/App.tsx', content);
