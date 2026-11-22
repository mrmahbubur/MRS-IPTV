const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/if \(isSecond\) \{\n\s*if \(currentChannel\.category === 'C Web 1'\) \{\n\s*parsedChannels\.push\(currentChannel\);\n\s*\}\n\s*\} else \{\n\s*parsedChannels\.push\(currentChannel\);\n\s*\}/, `if (isSecond) {
                currentChannel.category = 'C Web 1';
                parsedChannels.push(currentChannel);
              } else {
                parsedChannels.push(currentChannel);
              }`);

fs.writeFileSync('src/App.tsx', content);
