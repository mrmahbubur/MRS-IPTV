import fs from 'fs';
import path from 'path';

function getStrictCanonicalKey(rawName) {
  let name = (rawName || '').trim();
  // Strip country prefixes
  name = name.replace(/^(?:[A-Z]{2,3}\s*[:|-]\s*)/i, '');
  // Strip emojis & unicode symbols
  name = name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '');
  name = name.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
  name = name.replace(/[\u{2600}-\u{27BF}]/gu, '');
  // Strip bracketed or parenthesized tags
  name = name.replace(/[\(\[][^\)\]]*(?:backup|mirror|alt|geo|feed|server|not 24\/7|live|\d{3,4}p|sd|hd|fhd|uhd|4k|uk|usa?|in|bd|pk|ca|au|nz)[^\)\]]*[\)\]]/gi, '');
  name = name.replace(/[\(\[][^\)\]]*[\)\]]/gi, '');
  // Strip country names
  name = name.replace(/\b(?:bangladesh|india|pakistan|united kingdom|united states|america|usa?|canada)\b/gi, '');
  // Strip quality & resolution words
  name = name.replace(/\b(?:1080p|720p|576p|480p|4k|8k|fhd|uhd|hd|sd|hevc|raw)\b/gi, '');
  // Strip live tags & punctuation
  name = name.replace(/\s*[-–—|:]\s*live\b/gi, '');
  name = name.replace(/&/g, 'and');
  name = name.replace(/[-_.:|/]+/g, ' ');
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanChannelDisplayName(rawName) {
  let name = (rawName || '').trim();
  name = name.replace(/^(?:[A-Z]{2,3}\s*[:|-]\s*)/i, '');
  name = name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '');
  name = name.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
  name = name.replace(/[\u{2600}-\u{27BF}]/gu, '');
  name = name.replace(/[\(\[][^\)\]]*(?:backup|mirror|alt|geo|feed|server|not 24\/7)[^\)\]]*[\)\]]/gi, '');
  name = name.replace(/\s*[-–—|:]\s*live\b/gi, '');
  name = name.replace(/[-_.:|/]+/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  if (!name.toUpperCase().includes('HD') && !name.toUpperCase().includes('4K')) {
    name += ' HD';
  }
  return name;
}

const files = [
  'tiw4.m3u', 'e5dp.m3u', 'qz8o.m3u', 'xsjs.m3u', '4cxy.m3u', 
  'ryzj.m3u', 'qm49.m3u', '64yc.m3u', 'avbe.m3u', '9csf.m3u', 
  'sftq.m3u', 'vuqc.m3u', 'gpst.m3u', 'iptv_org.m3u'
];

let rawTotal = 0;
const canonicalMap = new Map();

for (const f of files) {
  const p = path.join(process.cwd(), 'data', f);
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, 'utf-8');
  const lines = content.split('\n');
  let curName = '';
  let curLogo = '';
  let curTvgId = '';
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      rawTotal++;
      const tvgName = line.match(/tvg-name="([^"]*)"/);
      const tvgLogo = line.match(/tvg-logo="([^"]*)"/);
      const tvgId = line.match(/tvg-id="([^"]*)"/);
      curName = tvgName ? tvgName[1] : line.split(',').pop()?.trim() || '';
      curLogo = tvgLogo ? tvgLogo[1] : '';
      curTvgId = tvgId ? tvgId[1] : '';
    } else if (line.trim().length > 0 && !line.trim().startsWith('#') && curName) {
      const url = line.trim();
      const key = getStrictCanonicalKey(curName);
      if (key && key.length >= 2) {
        if (!canonicalMap.has(key)) {
          canonicalMap.set(key, {
            name: cleanChannelDisplayName(curName),
            key,
            primaryUrl: url,
            mirrors: [url],
            logo: curLogo,
            tvgId: curTvgId
          });
        } else {
          const entry = canonicalMap.get(key);
          if (!entry.mirrors.includes(url)) {
            entry.mirrors.push(url);
          }
          if (!entry.logo && curLogo) entry.logo = curLogo;
          if (!entry.tvgId && curTvgId) entry.tvgId = curTvgId;
        }
      }
      curName = '';
      curLogo = '';
      curTvgId = '';
    }
  }
}

console.log('Total Raw Channel lines across all playlists:', rawTotal);
console.log('Total Unique Non-Duplicate Broadcasters:', canonicalMap.size);

const testChannels = ['t sports', 'somoy tv', 'btv', 'sony ten 1', 'tnt sports 1', 'star sports 1 hindi'];
for (const tc of testChannels) {
  const m = canonicalMap.get(tc);
  if (m) {
    console.log(`[${tc}] -> Name: "${m.name}", Mirrors count: ${m.mirrors.length}`);
  }
}
