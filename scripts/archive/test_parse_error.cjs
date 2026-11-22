const fs = require('fs');

async function test() {
  const fetchPlaylist = async (url) => {
    try {
      const res = await fetch('http://localhost:3000/api/proxy?url=' + encodeURIComponent(url));
      return await res.text();
    } catch (e) {
      return '';
    }
  };

  const [data1, data2, data3] = await Promise.all([
    fetchPlaylist('https://iptv-org.github.io/iptv/regions/asia.m3u'),
    fetchPlaylist('https://raw.githubusercontent.com/ahan443/FAST-IPTV/refs/heads/main/0.m3u'),
    fetchPlaylist('https://go.skym3u.top/2ium.m3u')
  ]);
  
  let idCounter = 1000;
  const parseM3u = (data, prefix) => {
    const lines = data.split('\n');
    const parsedChannels = [];
    let currentChannel = null;
    
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        currentChannel = {};
        const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
        const groupTitleMatch = line.match(/group-title="([^"]*)"/);
        const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
        
        currentChannel.id = prefix + '-' + idCounter++;
        currentChannel.name = tvgNameMatch ? tvgNameMatch[1] : line.split(',').pop()?.trim() || 'Unknown';
        
        const rawCategory = groupTitleMatch ? groupTitleMatch[1].trim().toLowerCase() : '';
        const nameLower = currentChannel.name.toLowerCase();
        
        let category = 'General';
        
        if (prefix === 'sky' || rawCategory.includes('bangla') || nameLower.includes('bangla')) category = 'Bangladeshi';
        else if (rawCategory.includes('sport') || nameLower.includes('sport') || nameLower.includes('football') || nameLower.includes('cricket') || nameLower.includes('tsn') || nameLower.includes('wwe')) category = 'Sports';
        else if (rawCategory.includes('movie') || rawCategory.includes('cinema') || rawCategory.includes('film') || nameLower.includes('movie') || nameLower.includes('cinema') || nameLower.includes('film')) category = 'Movies';
        else if (rawCategory.includes('news') || rawCategory.includes('business') || nameLower.includes('news') || nameLower.includes('24')) category = 'News';
        else if (rawCategory.includes('kid') || rawCategory.includes('animat') || rawCategory.includes('cartoon') || nameLower.includes('kid') || nameLower.includes('cartoon') || nameLower.includes('disney')) category = 'Kids';
        else if (rawCategory.includes('music') || nameLower.includes('music') || nameLower.includes('mtv')) category = 'Music';
        else if (rawCategory.includes('docum') || rawCategory.includes('scienc') || rawCategory.includes('educat') || nameLower.includes('discovery') || nameLower.includes('history')) category = 'Documentary';
        else if (rawCategory.includes('relig') || rawCategory.includes('islam') || rawCategory.includes('christian') || rawCategory.includes('culture') || nameLower.includes('islam') || nameLower.includes('quran')) category = 'Religious';
        else if (rawCategory.includes('entertain') || rawCategory.includes('comedy') || rawCategory.includes('series') || rawCategory.includes('family') || nameLower.includes('tv') || nameLower.includes('show')) category = 'Entertainment';
        else if (rawCategory.includes('lifestyle') || rawCategory.includes('cook') || rawCategory.includes('travel') || rawCategory.includes('outdoor')) category = 'Lifestyle';
        
        currentChannel.category = category;
        currentChannel.iconUrl = tvgLogoMatch ? tvgLogoMatch[1] : "https://i.postimg.cc/bJxcVY8r/Chat-GPT-Image-Jul-13-2026-05-56-15-PM-(1).png";
        currentChannel.status = 'live';
        currentChannel.viewersCount = Math.floor(Math.random() * 5000) + 100;
        currentChannel.currentProgram = 'No Program Found';
        currentChannel.nextProgram = 'No Program Found';
        currentChannel.provider = prefix === 'asia' ? 'IPTV Asia' : 'FAST IPTV';
      } else if (line.trim().length > 0 && !line.trim().startsWith('#') && currentChannel) {
        const streamUrl = line.trim();
        currentChannel.m3u8Url = streamUrl.startsWith('/api/proxy') ? streamUrl : '/api/proxy?url=' + encodeURIComponent(streamUrl);
        parsedChannels.push(currentChannel);
        currentChannel = null;
      }
    }
    return parsedChannels;
  };
  
  console.log("Parsing 1...");
  parseM3u(data1, 'asia');
  console.log("Parsing 2...");
  parseM3u(data2, 'fast');
  console.log("Parsing 3...");
  parseM3u(data3, 'sky');
  console.log("Success!");
}

test().catch(e => console.error("TEST FAILED", e));
