import { Channel } from '../types';

export const getWcUpToDateTime = (): string => {
  const now = new Date();
  const anchor = new Date('2026-07-26T00:02:00Z');
  const target = now > anchor ? now : anchor;
  
  const dd = String(target.getUTCDate()).padStart(2, '0');
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = target.getUTCFullYear();
  const hh = String(target.getUTCHours()).padStart(2, '0');
  const min = String(target.getUTCMinutes()).padStart(2, '0');
  
  return `${hh}:${min} ${dd}/${mm}/${yyyy}`;
};

export const recentWcChannels: Channel[] = [
  {
    id: 'fifa-01',
    name: 'FIFA World Cup 2026 - GRAND FINAL (ARG vs FRA)',
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://liveeu-gcp.alkassdigital.net/alkass3-p/main.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 185400,
    currentProgram: 'Live Replay: FIFA World Cup 2026 Grand Final - MetLife Stadium',
    nextProgram: 'FIFA World Cup Trophy Ceremony & Winner Celebrations',
    provider: 'Official FIFA HLS Stream 1',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/FIFA%2B_%282025%29.svg/960px-FIFA%2B_%282025%29.svg.png',
    accentColor: 'from-blue-600 to-indigo-900',
    resolution: '1080p 60fps',
    matchSnippet: {
      teams: 'Argentina vs France',
      score: '3 - 2 (AET)',
      eventStage: 'FIFA WC 2026 Grand Final',
      venue: 'MetLife Stadium, NY/NJ',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: 'FINAL REPLAY'
    }
  },
  {
    id: 'fifa-02',
    name: "ICC Men's T20 World Cup - Live Match Snippet",
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://liveeu-gcp.alkassdigital.net/alkass2-p/main.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 162900,
    currentProgram: 'Live Match: ICC T20 World Cup - India vs South Africa',
    nextProgram: 'ICC T20 World Cup Match Highlights & Post-Match Debates',
    provider: 'ICC Official Broadcaster / Alkass',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Cricket_ball.svg',
    accentColor: 'from-blue-600 to-sky-900',
    resolution: '1080p 60fps',
    matchSnippet: {
      teams: 'India vs South Africa',
      score: 'IND 176/7 (20 ov) vs SA 169/8',
      eventStage: 'T20 World Cup Final',
      venue: 'Kensington Oval, Barbados',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: 'LIVE NOW'
    }
  },
  {
    id: 'fifa-03',
    name: 'FIFA+ Official World Cup Vault & Highlights',
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://jmp2.uk/plu-660c29b5aec9680008f5b4a4.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 94200,
    currentProgram: 'Live: FIFA World Cup 2026 Top Goals & Best Saves Snippets',
    nextProgram: 'FIFA+ Golden Boot & Best Player Award Ceremony',
    provider: 'FIFA+ Network',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/FIFA%2B_%282025%29.svg/960px-FIFA%2B_%282025%29.svg.png',
    accentColor: 'from-sky-500 to-blue-800',
    resolution: '720p HD',
    matchSnippet: {
      teams: 'All Tournament Teams',
      score: 'Top 100 Goals',
      eventStage: 'WC 2026 Official Snippets',
      venue: 'Global Broadcast Feed',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: '24/7 STREAM'
    }
  },
  {
    id: 'fifa-04',
    name: 'FOX Sports World Cup - USA vs Mexico Semi Final',
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://dnf08l6u6uxnz.cloudfront.net/master.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 112000,
    currentProgram: 'Live Replay: FIFA World Cup Semi Final - USA vs Mexico',
    nextProgram: 'FOX Soccer World Cup Today & Post-Game Analysis',
    provider: 'FOX Sports Network',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Fox_Sports_1_logo.svg',
    accentColor: 'from-blue-600 to-blue-900',
    resolution: '1080p HD',
    matchSnippet: {
      teams: 'USA vs Mexico',
      score: '2 - 1 (FT)',
      eventStage: 'World Cup Semi Final',
      venue: 'AT&T Stadium, Dallas',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: 'SEMI FINAL'
    }
  },
  {
    id: 'fifa-05',
    name: 'FIH Hockey World Cup - Live Championship',
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 84300,
    currentProgram: 'Live Match: FIH Men\'s Hockey World Cup Final - Netherlands vs Germany',
    nextProgram: 'FIH Hockey World Cup Trophy Ceremony & Player Interviews',
    provider: 'Official FIH Live Stream',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Field_hockey_icon.svg',
    accentColor: 'from-emerald-600 to-teal-900',
    resolution: '1080p 60fps',
    matchSnippet: {
      teams: 'Netherlands vs Germany',
      score: '3 - 3 (Shootout 5-4)',
      eventStage: 'FIH Hockey WC Final',
      venue: 'Birsa Munda Hockey Stadium',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: 'SHOOTOUT DRAMA'
    }
  },
  {
    id: 'fifa-06',
    name: 'Telemundo Deportes - Copa Mundial 2026 Resumen',
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://d3b6q2ou5kp8ke.cloudfront.net/ESPNTheOcho.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 91500,
    currentProgram: 'En Vivo: Resumen de la Copa Mundial 2026 y Momentos Inolvidables',
    nextProgram: 'Especial Telemundo: Campeones del Mundo 2026',
    provider: 'Telemundo Network',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Telemundo_logo.svg',
    accentColor: 'from-amber-500 to-red-700',
    resolution: '720p HD',
    matchSnippet: {
      teams: 'Brasil vs España',
      score: '2 - 1 (FT)',
      eventStage: 'Copa Mundial Resumen',
      venue: 'SoFi Stadium, Los Angeles',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: 'EN VIVO ESPAÑOL'
    }
  },
  {
    id: 'fifa-07',
    name: 'FIBA Basketball World Cup - Gold Medal Game',
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://liveeu-gcp.alkassdigital.net/alkass1-p/main.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 79800,
    currentProgram: 'Live: FIBA Basketball World Cup Final - Germany vs Serbia',
    nextProgram: 'FIBA World Cup All-Star Five & MVP Award Ceremony',
    provider: 'BeIN Sports / FIBA',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/43/BeIN_Sports_logo.svg',
    accentColor: 'from-purple-600 to-purple-900',
    resolution: '1080p HD',
    matchSnippet: {
      teams: 'Germany vs Serbia',
      score: '83 - 77 (Q4 0:00)',
      eventStage: 'FIBA WC Gold Medal Match',
      venue: 'Mall of Asia Arena',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: 'CHAMPIONSHIP'
    }
  },
  {
    id: 'fifa-08',
    name: 'BBC Sport - Rugby World Cup Live Broadcast',
    category: "Recent WC Event's",
    m3u8Url: '/api/proxy?url=' + encodeURIComponent('https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8'),
    embedUrl: '',
    status: 'live',
    viewersCount: 68400,
    currentProgram: 'Live: Rugby World Cup Final - South Africa vs New Zealand',
    nextProgram: 'BBC Sport Rugby World Cup Special & Player Ratings',
    provider: 'BBC Sport',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/BBC_One_2021.svg',
    accentColor: 'from-red-600 to-red-950',
    resolution: '1080p HD',
    matchSnippet: {
      teams: 'South Africa vs New Zealand',
      score: '12 - 11 (FT)',
      eventStage: 'Rugby WC Final',
      venue: 'Stade de France, Paris',
      lastUpdated: getWcUpToDateTime(),
      statusBadge: 'FULL TIME REPLAY'
    }
  }
];

export const fifaChannels: Channel[] = recentWcChannels;
