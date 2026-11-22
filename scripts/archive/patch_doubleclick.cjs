const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const DoubleClickBackButton = \(\{ onBack \}: \{ onBack: \(\) => void \}\) => \{[\s\S]*?className="absolute top-4/, `const DoubleClickBackButton = ({ onBack }: { onBack: () => void }) => {
  const [clickedOnce, setClickedOnce] = useState(false);
  const calledBackRef = React.useRef(false);
  
  const handleBack = () => {
    if (calledBackRef.current) return;
    calledBackRef.current = true;
    onBack();
  };

  return (
    <button 
      onClick={() => {
        if (!clickedOnce) {
          setClickedOnce(true);
          setTimeout(() => setClickedOnce(false), 3000);
        } else {
          handleBack();
        }
      }}
      className="absolute top-4`);

fs.writeFileSync('src/App.tsx', content);
