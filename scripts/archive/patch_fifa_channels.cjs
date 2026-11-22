const fs = require('fs');

const fifaContent = `import { Channel } from '../types';

export const FIFA_CHANNELS: Channel[] = [
  {
    "id": "chan-fifa-wc-1",
    "name": "World Cup Live",
    "category": "WORLD CUP",
    "m3u8Url": "https://live01-cn-ali.bvjicd.com/live/79361366.m3u8",
    "embedUrl": "https://play.88player.top/m3u8.html?url=https://live01-cn-ali.bvjicd.com/live/79361366.m3u8",
    "status": "live",
    "viewersCount": 65200,
    "currentProgram": "World Cup Match",
    "nextProgram": "Post-match Analysis",
    "provider": "88Player",
    "icon": "🏆",
    "accentColor": "from-amber-400 to-yellow-600",
    "resolution": "1080p FHD"
  },
  {
    "id": "chan-fifa-3",
    "name": "FOX 03",
    "category": "WORLD CUP",
    "m3u8Url": "http://stream.cammonitorplus.net/1752/index.m3u8",
    "embedUrl": "https://play.88player.top/m3u8.html?url=http%3A%2F%2Fstream.cammonitorplus.net%2F1752%2Findex.m3u8",
    "status": "live",
    "viewersCount": 54106,
    "currentProgram": "FIFA World Cup 2026",
    "nextProgram": "Match Highlights",
    "provider": "FIFAWC 2026",
    "icon": "⚽",
    "accentColor": "from-green-500 to-emerald-600",
    "resolution": "1080p FHD"
  }
];
`;

fs.writeFileSync('src/data/fifaChannels.ts', fifaContent);
