const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Ensure selectedChannel can be null
content = content.replace(
  /const \[selectedChannel, setSelectedChannel\] = useState<Channel>\(INITIAL_CHANNELS\[1\]\);/,
  `const [selectedChannel, setSelectedChannel] = useState<Channel | null>(INITIAL_CHANNELS[1]);`
);

// Add control handlers
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

// We need to make sure getFilteredChannels exists and uses searchQuery
// I added it before, let's verify if it's there.

fs.writeFileSync('src/App.tsx', content);
