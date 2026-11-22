const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const handlePopState = \(e\) => \{[\s\S]*?setSelectedChannel\(null\);\n\s*return 0;\n\s*\}\n\s*\}\);\n\s*\};/, `const handlePopState = (e) => {
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
            setActiveView('home');
            return 0;
          }
        });
      };`);

content = content.replace(/<DoubleClickBackButton onBack=\{\(\) => \{\n\s*if \(document\.fullscreenElement\) \{\n\s*document\.exitFullscreen\(\)\.catch\(\(\) => \{\}\);\n\s*\}\n\s*setSelectedChannel\(null\);\n\s*\}\} \/>/, `<DoubleClickBackButton onBack={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                setSelectedChannel(null);
                setActiveView('home');
                window.history.back();
              }} />`);

fs.writeFileSync('src/App.tsx', content);
