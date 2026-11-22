const fs = require('fs');

async function test() {
  const d1 = await fetch('http://localhost:3000/api/proxy?url=' + encodeURIComponent('https://iptv-org.github.io/iptv/regions/asia.m3u')).then(r=>r.text());
  const d2 = await fetch('http://localhost:3000/api/proxy?url=' + encodeURIComponent('https://raw.githubusercontent.com/ahan443/FAST-IPTV/refs/heads/main/0.m3u')).then(r=>r.text());
  const d3 = await fetch('http://localhost:3000/api/proxy?url=' + encodeURIComponent('https://go.skym3u.top/2ium.m3u')).then(r=>r.text());
  
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
        currentChannel.name = tvgNameMatch ? tvgNameMatch[1] : (line.split(',').pop()?.trim() || 'Unknown');
        
              const rawCategory = groupTitleMatch ? groupTitleMatch[1].trim().toLowerCase() : '';
              const nameLower = currentChannel.name.toLowerCase();
              
              let category = 'General';
              
              if (rawCategory.includes('sport') || nameLower.includes('sport') || nameLower.includes('football') || nameLower.includes('cricket') || nameLower.includes('tsn') || nameLower.includes('wwe')) category = 'Sports';
              else if (rawCategory.includes('movie') || rawCategory.includes('cinema') || rawCategory.includes('film') || nameLower.includes('movie') || nameLower.includes('cinema') || nameLower.includes('film')) category = 'Movies';
              else if (rawCategory.includes('news') || rawCategory.includes('business') || nameLower.includes('news') || nameLower.includes('24')) category = 'News';
              else if (rawCategory.includes('kid') || rawCategory.includes('animat') || rawCategory.includes('cartoon') || nameLower.includes('kid') || nameLower.includes('cartoon') || nameLower.includes('disney')) category = 'Kids';
              else if (rawCategory.includes('music') || nameLower.includes('music') || nameLower.includes('mtv')) category = 'Music';
              else if (rawCategory.includes('docum') || rawCategory.includes('scienc') || rawCategory.includes('educat') || nameLower.includes('discovery') || nameLower.includes('history')) category = 'Documentary';
              else if (rawCategory.includes('relig') || rawCategory.includes('islam') || rawCategory.includes('christian') || rawCategory.includes('culture') || nameLower.includes('islam') || nameLower.includes('quran')) category = 'Religious';
              else if (rawCategory.includes('entertain') || rawCategory.includes('comedy') || rawCategory.includes('series') || rawCategory.includes('family') || nameLower.includes('tv') || nameLower.includes('show')) category = 'Entertainment';
              else if (rawCategory.includes('lifestyle') || rawCategory.includes('cook') || rawCategory.includes('travel') || rawCategory.includes('outdoor')) category = 'Lifestyle';
              
              currentChannel.category = category;

      } else if (line.trim().length > 0 && !line.trim().startsWith('#') && currentChannel) {
        parsedChannels.push(currentChannel);
        currentChannel = null;
      }
    }
    return parsedChannels;
  };
  
  const c1 = parseM3u(d1, 'asia');
  const c2 = parseM3u(d2, 'fast');
  const c3 = parseM3u(d3, 'sky');
  
  const allCats = new Set([...c1.map(c=>c.category), ...c2.map(c=>c.category), ...c3.map(c=>c.category)]);
  console.log("All Categories:", Array.from(allCats));
}

test().catch(e => console.error("Error:", e));
