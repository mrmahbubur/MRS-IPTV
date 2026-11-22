const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /useEffect\(\(\) => \{[\s\S]*?\.catch\(console\.error\);\s*\}, \[\]\);/g;
const newUseEffect = `useEffect(() => {
    Promise.all([
      fetch('https://go.skym3u.top/ziyf.m3u').then(res => res.text()),
      fetch('https://raw.githubusercontent.com/ahan443/FAST-IPTV/refs/heads/main/elite.m3u8').then(res => res.text()).catch(() => '')
    ]).then(([data1, data2]) => {
        let idCounter = 1000;
        
        const parseM3u = (data, isSecond) => {
          const lines = data.split('\\n');
          const parsedChannels = [];
          let currentChannel = null;
          
          for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
              currentChannel = {};
              const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
              const groupTitleMatch = line.match(/group-title="([^"]*)"/);
              const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
              
              currentChannel.id = 'iptv-org-' + idCounter++;
              currentChannel.name = tvgNameMatch ? tvgNameMatch[1] : line.split(',').pop()?.trim() || 'Unknown';
              
              let category = groupTitleMatch ? groupTitleMatch[1].trim() : '';
              if (!category) {
                const nameLower = currentChannel.name.toLowerCase();
                if (nameLower.includes('sport') || nameLower.includes('football') || nameLower.includes('cricket') || nameLower.includes('tsn') || nameLower.includes('wwe')) category = 'Sports';
                else if (nameLower.includes('movie') || nameLower.includes('cinema') || nameLower.includes('film')) category = 'Movies';
                else if (nameLower.includes('news') || nameLower.includes('24')) category = 'News';
                else if (nameLower.includes('kid') || nameLower.includes('cartoon') || nameLower.includes('disney')) category = 'Kids';
                else if (nameLower.includes('music') || nameLower.includes('mtv')) category = 'Music';
                else category = 'TV Shows';
              }
              currentChannel.category = category;
              currentChannel.iconUrl = "https://i.postimg.cc/bJxcVY8r/Chat-GPT-Image-Jul-13-2026-05-56-15-PM-(1).png";
              currentChannel.status = 'live';
              currentChannel.viewersCount = Math.floor(Math.random() * 5000) + 100;
              currentChannel.currentProgram = 'No Program Found';
              currentChannel.nextProgram = 'No Program Found';
              currentChannel.provider = 'IPTV Org';
            } else if (line.startsWith('http') && currentChannel) {
              currentChannel.m3u8Url = line.trim();
              if (isSecond) {
                if (currentChannel.category === 'C Web 1') {
                  parsedChannels.push(currentChannel);
                }
              } else {
                parsedChannels.push(currentChannel);
              }
              currentChannel = null;
            }
          }
          return parsedChannels;
        };

        const parsed1 = parseM3u(data1, false);
        const parsed2 = parseM3u(data2, true);
        const parsedChannels = [...parsed1, ...parsed2];
        
        applyEPGToChannels(parsedChannels)
          .then(epgChannels => {
            setChannels(epgChannels);
          });
      })
      .catch(console.error);
  }, []);`;

content = content.replace(regex, newUseEffect);
fs.writeFileSync('src/App.tsx', content);
