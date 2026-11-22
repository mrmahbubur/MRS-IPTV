const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// It seems there are multiple handleStop declarations now.
content = content.replace(/const handleStop = \(\) => \{\n\s*setSelectedChannel\(null\);\n\s*\};\n\n\s*/g, '');

// Put one clean copy back
content = content.replace(
  /const handleNext = \(\) => \{/,
  `const handleStop = () => {
    setSelectedChannel(null);
  };

  const handleNext = () => {`
);

fs.writeFileSync('src/App.tsx', content);
