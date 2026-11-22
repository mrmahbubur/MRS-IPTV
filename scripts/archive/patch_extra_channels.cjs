const fs = require('fs');

const extraContent = `import { Channel } from '../types';

export const EXTRA_CHANNELS: Channel[] = [
  {
    "id": "chan-cctv-5",
    "name": "CCTV-5 Sports",
    "category": "FASTEST",
    "m3u8Url": "https://www.rtmpcdn.com/live/cctv5.m3u8",
    "embedUrl": "https://play.88player.top/m3u8.html?url=https://www.rtmpcdn.com/live/cctv5.m3u8",
    "status": "live",
    "viewersCount": 38295,
    "currentProgram": "Sports Live",
    "nextProgram": "Sports Updates",
    "provider": "CCTV",
    "icon": "🥇",
    "accentColor": "from-blue-500 to-emerald-600",
    "resolution": "1080p FHD"
  },
  {
    "id": "chan-migu",
    "name": "Migu Sports Live",
    "category": "FASTEST",
    "m3u8Url": "https://www.rtmpcdn.com/live/migu1.m3u8",
    "embedUrl": "https://play.88player.top/m3u8.html?url=https://www.rtmpcdn.com/live/migu1.m3u8",
    "status": "live",
    "viewersCount": 18450,
    "currentProgram": "Sports Live",
    "nextProgram": "Sports Updates",
    "provider": "Migu",
    "icon": "🏀",
    "accentColor": "from-orange-500 to-amber-600",
    "resolution": "720p HD"
  },
  {
    id: 'extra-1',
    name: 'Live Channel 1',
    category: 'FASTEST',
    m3u8Url: 'https://video10.letaocm.top/live/sd-1-4459810.m3u8?txSecret=be58ad4c6cac1fe6be5bdf091ac6aea0&txTime=1783804252n',
    embedUrl: 'https://play.88player.top/m3u8.html?url=https://video10.letaocm.top/live/sd-1-4459810.m3u8?txSecret=be58ad4c6cac1fe6be5bdf091ac6aea0&txTime=1783804252n',
    status: 'live',
    viewersCount: Math.floor(Math.random() * 5000) + 1000,
    currentProgram: 'Live Stream 1',
    nextProgram: 'Up Next',
    provider: 'Web TV',
  },
  {
    id: 'extra-2',
    name: 'Live Channel 2',
    category: 'FASTEST',
    m3u8Url: 'https://live.kinxie.com/live/53452529_20f970c6734437509dc82d3bc7a9e9aa.m3u8',
    embedUrl: 'https://play.88player.top/m3u8.html?url=https://live.kinxie.com/live/53452529_20f970c6734437509dc82d3bc7a9e9aa.m3u8',
    status: 'live',
    viewersCount: Math.floor(Math.random() * 5000) + 1000,
    currentProgram: 'Live Stream 2',
    nextProgram: 'Up Next',
    provider: 'Web TV',
  },
];
`;
fs.writeFileSync('src/data/extraChannels.ts', extraContent);
