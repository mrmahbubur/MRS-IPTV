const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove the duplicated handleStop, handleNext, handlePrev
content = content.replace(/const handleStop = \(\) => \{\n    setSelectedChannel\(null\);\n  \};\n\n  const handleNext = \(\) => \{\n    if \(!selectedChannel\) return;\n    const list = getFilteredChannels\(\);\n    const idx = list.findIndex\(c => c\.id === selectedChannel\.id\);\n    if \(idx >= 0 && idx < list\.length - 1\) \{\n      handleSelectChannel\(list\[idx \+ 1\]\);\n    \}\n  \};\n\n  const handlePrev = \(\) => \{\n    if \(!selectedChannel\) return;\n    const list = getFilteredChannels\(\);\n    const idx = list\.findIndex\(c => c\.id === selectedChannel\.id\);\n    if \(idx > 0\) \{\n      handleSelectChannel\(list\[idx - 1\]\);\n    \}\n  \};\n\n  /g, '');

content = content.replace(/const handleNext = \(\) => \{\n    if \(!selectedChannel\) return;\n    const list = getFilteredChannels\(\);\n    const idx = list\.findIndex\(c => c\.id === selectedChannel\.id\);\n    if \(idx >= 0 && idx < list\.length - 1\) \{\n      handleSelectChannel\(list\[idx \+ 1\]\);\n    \}\n  \};\n\n  const handlePrev = \(\) => \{\n    if \(!selectedChannel\) return;\n    const list = getFilteredChannels\(\);\n    const idx = list\.findIndex\(c => c\.id === selectedChannel\.id\);\n    if \(idx > 0\) \{\n      handleSelectChannel\(list\[idx - 1\]\);\n    \}\n  \};\n\n  /g, '');

// Put one clean copy back
content = content.replace(
  /const handleSelectChannel = \(channel: Channel\) => \{/,
  `const handleStop = () => {
    setSelectedChannel(null);
  };

  const handleNext = () => {
    if (!selectedChannel) return;
    const list = getFilteredChannels();
    const idx = list.findIndex(c => c.id === selectedChannel.id);
    if (idx >= 0 && idx < list.length - 1) {
      handleSelectChannel(list[idx + 1]);
    }
  };

  const handlePrev = () => {
    if (!selectedChannel) return;
    const list = getFilteredChannels();
    const idx = list.findIndex(c => c.id === selectedChannel.id);
    if (idx > 0) {
      handleSelectChannel(list[idx - 1]);
    }
  };

  const handleSelectChannel = (channel: Channel) => {`
);

fs.writeFileSync('src/App.tsx', content);
