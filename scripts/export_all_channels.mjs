import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const files = fs.existsSync(dataDir)
  ? fs.readdirSync(dataDir)
      .filter(f => f.endsWith('.m3u'))
      .sort()
      .map(file => ({ file, title: `Playlist (${file})` }))
  : [];

const nameGroupMap = new Map();
let rawTotalCount = 0;

for (const item of files) {
  const filePath = path.join(dataDir, item.file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  let name = '';
  let group = 'General';
  let logo = '';

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('#EXTINF:')) {
      const mName = l.match(/tvg-name="([^"]*)"/);
      const mGroup = l.match(/group-title="([^"]*)"/);
      const mLogo = l.match(/tvg-logo="([^"]*)"/);
      const commaIdx = l.lastIndexOf(',');
      const trailingName = commaIdx >= 0 ? l.slice(commaIdx + 1).trim() : '';
      name = (mName && mName[1].trim()) ? mName[1].trim() : (trailingName || 'Channel');
      group = (mGroup && mGroup[1].trim()) ? mGroup[1].trim() : 'General';
      logo = (mLogo && mLogo[1].trim()) ? mLogo[1].trim() : '';
    } else if (/^https?:\/\//i.test(l)) {
      if (name && !name.toLowerCase().includes('skym3u') && !name.toLowerCase().includes('visit')) {
        rawTotalCount++;
        const rawName = name.trim();
        const normKey = rawName.toLowerCase().replace(/\s+/g, ' ');

        if (!nameGroupMap.has(normKey)) {
          nameGroupMap.set(normKey, {
            name: rawName,
            group,
            logo,
            primaryUrl: l,
            mirrors: [l],
            source: item.title
          });
        } else {
          const existing = nameGroupMap.get(normKey);
          if (!existing.mirrors.includes(l)) {
            existing.mirrors.push(l);
          }
          const isCurrentHd = rawName.toUpperCase().includes('HD') || rawName.toUpperCase().includes('FHD') || l.includes('1080');
          const isExistingHd = existing.name.toUpperCase().includes('HD') || existing.name.toUpperCase().includes('FHD') || existing.primaryUrl.includes('1080');
          if (isCurrentHd && !isExistingHd) {
            existing.primaryUrl = l;
            existing.name = rawName;
          }
        }
      }
      name = '';
      group = 'General';
      logo = '';
    }
  }
}

const consolidatedList = Array.from(nameGroupMap.values());

let outText = '=======================================================\n';
outText += ' M R S IPTV - DEDUPLICATED & CONSOLIDATED CHANNELS EXPORT\n';
outText += ` Total Unique Channels: ${consolidatedList.length} (from ${rawTotalCount} raw streams across ${files.length} sources)\n`;
outText += ' Single Best Playable Line selected per channel with multi-mirror backup lines\n';
outText += '=======================================================\n\n';

let plainLinks = '';
let m3uOut = '#EXTM3U\n';

consolidatedList.forEach((ch, idx) => {
  outText += `${idx + 1}. [${ch.group}] ${ch.name}\n`;
  outText += `   Primary Playable URL: ${ch.primaryUrl}\n`;
  outText += `   Proxy Player Stream: /api/proxy?url=${encodeURIComponent(ch.primaryUrl)}\n`;
  if (ch.mirrors.length > 1) {
    outText += `   Backup Mirrors Available: ${ch.mirrors.length - 1} line(s)\n`;
    ch.mirrors.slice(1).forEach((m, mIdx) => {
      outText += `     Mirror ${mIdx + 2}: ${m}\n`;
    });
  }
  outText += '\n';

  plainLinks += `${ch.name} | ${ch.group} | ${ch.primaryUrl}\n`;
  m3uOut += `#EXTINF:-1 tvg-name="${ch.name.replace(/"/g, '')}" tvg-logo="${(ch.logo || '').replace(/"/g, '')}" group-title="${ch.group.replace(/"/g, '')}",${ch.name}\n${ch.primaryUrl}\n`;
});

const pubDir = path.join(process.cwd(), 'public');
fs.writeFileSync(path.join(pubDir, 'all_channel_links.txt'), outText, 'utf-8');
fs.writeFileSync(path.join(pubDir, 'all_channel_links.json'), JSON.stringify(consolidatedList, null, 2), 'utf-8');
fs.writeFileSync(path.join(pubDir, 'all-channels-links.txt'), plainLinks, 'utf-8');
fs.writeFileSync(path.join(pubDir, 'all-channels.m3u8'), m3uOut, 'utf-8');
console.log(`Generated consolidated channels export: ${consolidatedList.length} unique channels across ${files.length} playlists.`);
