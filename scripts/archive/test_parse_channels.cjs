const fs = require('fs');
async function test() {
  const res = await fetch('http://localhost:3000/api/proxy?url=' + encodeURIComponent('https://iptv-org.github.io/iptv/regions/asia.m3u'));
  const text = await res.text();
  
  const parseM3u = (data, prefix) => {
    let idCounter = 1000;
    const lines = data.split('\n');
    const parsedChannels = [];
    let currentChannel = null;
    
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        currentChannel = {};
        currentChannel.id = prefix + '-' + idCounter++;
        currentChannel.name = line.split(',').pop()?.trim() || 'Unknown';
      } else if (line.trim().length > 0 && !line.trim().startsWith('#') && currentChannel) {
        const streamUrl = line.trim();
        currentChannel.m3u8Url = streamUrl;
        parsedChannels.push(currentChannel);
        currentChannel = null;
      }
    }
    return parsedChannels;
  };

  const c = parseM3u(text, 'test');
  console.log("Channels:", c.length);
}
test();
