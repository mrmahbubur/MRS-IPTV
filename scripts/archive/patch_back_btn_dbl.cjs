const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const DoubleClickBackButton = \(\{ onBack \}\) => \{[\s\S]*?export default function App\(\) \{/, `const DoubleClickBackButton = ({ onBack }: { onBack: () => void }) => {
  const [clickedOnce, setClickedOnce] = useState(false);
  return (
    <button 
      onDoubleClick={() => {
        onBack();
      }}
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
      {clickedOnce ? "Double click or press again to exit" : "Back"}
    </button>
  );
};

export default function App() {`);

fs.writeFileSync('src/App.tsx', content);
