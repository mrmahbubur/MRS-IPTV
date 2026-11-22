const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Add import
appContent = appContent.replace(
  /import \{ Home \} from '.\/components\/Home';/,
  "import { Home } from './components/Home';\nimport { applyEPGToChannels } from './lib/epg';"
);

// Update fetch
appContent = appContent.replace(
  /setChannels\(parsedChannels\);\n      \}\)\n      \.catch\(console\.error\);/s,
  `applyEPGToChannels(parsedChannels)
          .then(epgChannels => {
            setChannels(epgChannels);
          });
      })
      .catch(console.error);`
);

fs.writeFileSync('src/App.tsx', appContent);
