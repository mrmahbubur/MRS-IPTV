const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/if \(window\.programmaticBack\) \{\n\s*window\.programmaticBack = false;\n\s*return;\n\s*\}/, `if (window.programmaticBack) {
          window.programmaticBack = false;
          // Even if programmatic back, we might need to reset state if the listener is still active
          return;
        }`);

content = content.replace(/<DoubleClickBackButton onBack=\{\(\) => \{\n\s*if \(document\.fullscreenElement\) \{\n\s*document\.exitFullscreen\(\)\.catch\(\(\) => \{\}\);\n\s*\}\n\s*window\.programmaticBack = true;\n\s*setSelectedChannel\(null\);\n\s*setActiveView\('home'\);\n\s*window\.history\.back\(\);\n\s*\}\} \/>/, `<DoubleClickBackButton onBack={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                window.programmaticBack = true;
                window.history.back();
                setTimeout(() => {
                  setSelectedChannel(null);
                  setActiveView('home');
                  window.programmaticBack = false;
                }, 50);
              }} />`);

fs.writeFileSync('src/App.tsx', content);
