const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const handlePopState = \(e\) => \{\n\s*setBackPressCount\(prev => \{/, `const handlePopState = (e) => {
        if (window.programmaticBack) {
          window.programmaticBack = false;
          return;
        }
        setBackPressCount(prev => {`);

content = content.replace(/<DoubleClickBackButton onBack=\{\(\) => \{\n\s*if \(document\.fullscreenElement\) \{\n\s*document\.exitFullscreen\(\)\.catch\(\(\) => \{\}\);\n\s*\}\n\s*setSelectedChannel\(null\);\n\s*setActiveView\('home'\);\n\s*window\.history\.back\(\);\n\s*\}\} \/>/, `<DoubleClickBackButton onBack={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                window.programmaticBack = true;
                setSelectedChannel(null);
                setActiveView('home');
                window.history.back();
              }} />`);

// Add type for window.programmaticBack to avoid TS error
content = content.replace(/import \{ Channel \} from '\.\/types';/, `import { Channel } from './types';

declare global {
  interface Window {
    programmaticBack?: boolean;
  }
}`);

fs.writeFileSync('src/App.tsx', content);
