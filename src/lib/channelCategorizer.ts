import { Channel } from '../types';
import { getChannelLogo } from './channelLogos';

/**
 * Ensures exact, accurate, and clean categorization for every channel in the system.
 */
export function getExactChannelCategory(channel: Partial<Channel> & { name: string }): string {
  const nameLower = (channel.name || '').toLowerCase().trim();
  const rawCat = (channel.category || '').toLowerCase().trim();
  const groupTitle = (channel as any).groupTitle ? String((channel as any).groupTitle).toLowerCase().trim() : '';

  const combined = `${nameLower} ${rawCat} ${groupTitle}`;

  // 1. World Cup / FIFA / WC Event Channels (STRICT REQUIREMENT: "Recent WC Event's")
  if (
    combined.includes('world cup') ||
    combined.includes('worldcup') ||
    combined.includes('fifa') ||
    combined.includes('icc ') ||
    combined.includes('t20 wc') ||
    combined.includes('cwc') ||
    combined.includes('wc 2026') ||
    combined.includes('wc event') ||
    combined.includes('recent wc') ||
    rawCat === "world cup live tournaments" ||
    rawCat === "fifa world cup 2026" ||
    rawCat === "recent wc event's" ||
    (channel.id && String(channel.id).startsWith('fifa-'))
  ) {
    return "Recent WC Event's";
  }

  // 2. Bangladeshi Channels
  if (
    !nameLower.includes('sportv') && (
      rawCat.includes('bangla') || rawCat.includes('bangladeshi') ||
      nameLower.includes('bangla') || nameLower.includes('btv') || nameLower.includes('somoy') ||
      nameLower.includes('channel i') || nameLower.includes('atn') || nameLower.includes('ntv') ||
      nameLower.includes('rtv') || nameLower.includes('deepto') || nameLower.includes('maasranga') ||
      nameLower.includes('gtv') || nameLower.includes('gazi') || nameLower.includes('jamuna') ||
      nameLower.includes('ekattor') || nameLower.includes('independent tv') || nameLower.includes('news 24') ||
      nameLower.includes('dbc') || nameLower.includes('channel 24') || nameLower.includes('nagorik') ||
      nameLower.includes('bijoy') || nameLower.includes('duronto') || nameLower.includes('desh tv') ||
      nameLower.includes('my tv') || nameLower.includes('asian tv') || nameLower.includes('bangla vision') ||
      nameLower.includes('boishakhi') || nameLower.includes('saamtv') || nameLower.includes('saatv')
    )
  ) {
    return 'Bangladeshi';
  }

  // 3. Sports & Live Events (Matches, Leagues, Tournaments, Sports TV)
  if (
    rawCat === 'live events' ||
    groupTitle === 'live events' ||
    (nameLower.includes('[') && nameLower.includes(']') && (
      nameLower.includes('football') || nameLower.includes('baseball') || nameLower.includes('basketball') ||
      nameLower.includes('soccer') || nameLower.includes('cricket') || nameLower.includes('tennis') ||
      nameLower.includes('racing') || nameLower.includes('rugby') || nameLower.includes('boxing') ||
      nameLower.includes('wrestling') || nameLower.includes('copa') || nameLower.includes('liga') ||
      nameLower.includes('vs.') || nameLower.includes(' vs ') || nameLower.includes(' at ')
    )) ||
    rawCat.includes('sport') || nameLower.includes('sport') || nameLower.includes('football') ||
    nameLower.includes('cricket') || nameLower.includes('tsn') || nameLower.includes('wwe') ||
    nameLower.includes('tna') || nameLower.includes('bein') || nameLower.includes('ten sports') ||
    nameLower.includes('star sports') || nameLower.includes('sony sports') || nameLower.includes('supersport') ||
    nameLower.includes('eurosport') || nameLower.includes('willow') || nameLower.includes('ptv sports') ||
    nameLower.includes('astro arena') || nameLower.includes('tnt sports') || nameLower.includes('dazn') ||
    nameLower.includes('f1') || nameLower.includes('formula 1') || nameLower.includes('formula 3') ||
    nameLower.includes('nba') || nameLower.includes('nfl') || nameLower.includes('mlb') ||
    nameLower.includes('nhl') || nameLower.includes('espn') || nameLower.includes('skysports') ||
    nameLower.includes('sky sports') || nameLower.includes('atp') || nameLower.includes('wta') ||
    nameLower.includes('golf') || nameLower.includes('ufc') || nameLower.includes('fight') ||
    nameLower.includes('fox sports') || nameLower.includes('fancode') || nameLower.includes('t sports') ||
    nameLower.includes('match tv') || nameLower.includes('arena sport') || nameLower.includes('acc network') ||
    nameLower.includes('altitude') || nameLower.includes('big ten') || nameLower.includes('cbs sports') ||
    nameLower.includes('sec network') || nameLower.includes('yes network') || nameLower.includes('sportsnet') ||
    nameLower.includes('marquee') || nameLower.includes('monumental') || nameLower.includes('msg') ||
    nameLower.includes('nesn') || nameLower.includes('bally') || nameLower.includes('spectrum sportsnet') ||
    nameLower.includes('space city') || nameLower.includes('premier sports') || nameLower.includes('tudn') ||
    nameLower.includes('fanduel') || nameLower.includes('chicago sports') || nameLower.includes('floracing') ||
    nameLower.includes('racer network')
  ) {
    return 'Sports';
  }

  // 4. Movies & Cinema
  if (
    rawCat.includes('movie') || rawCat.includes('cinema') || rawCat.includes('film') ||
    nameLower.includes('movie') || nameLower.includes('cinema') || nameLower.includes('film') ||
    nameLower.includes('hbo') || nameLower.includes('cinemax') || nameLower.includes('star movies') ||
    nameLower.includes('sony max') || nameLower.includes('zee cinema') || nameLower.includes('film4') ||
    nameLower.includes('movieplex') || nameLower.includes('cinecanal') || nameLower.includes('star gold') ||
    nameLower.includes('colors cineplex') || nameLower.includes('sky cinema') || nameLower.includes('showtime') ||
    nameLower.includes('starz') || nameLower.includes('hallmark') || nameLower.includes('amc') ||
    nameLower.includes('tcm') || nameLower.includes('turner classic') || nameLower.includes('mgm') ||
    nameLower.includes('epix') || nameLower.includes('screenpix') || nameLower.includes('flix') ||
    nameLower.includes('sundance') || nameLower.includes('ifc')
  ) {
    return 'Movies';
  }

  // 5. News & Weather
  if (
    rawCat.includes('news') || nameLower.includes('news') || nameLower.includes('bbc') ||
    nameLower.includes('cnn') || nameLower.includes('al jazeera') || nameLower.includes('sky news') ||
    nameLower.includes('fox news') || nameLower.includes('nbc news') || nameLower.includes('dw') ||
    nameLower.includes('euronews') || nameLower.includes('cbs news') || nameLower.includes('abc news') ||
    nameLower.includes('times now') || nameLower.includes('republic') || nameLower.includes('aaj tak') ||
    nameLower.includes('ndtv') || nameLower.includes('msnbc') || nameLower.includes('bloomberg') ||
    nameLower.includes('cnbc') || nameLower.includes('weather') || nameLower.includes('accuweather') ||
    nameLower.includes('weathernation') || nameLower.includes('c-span') || nameLower.includes('cheddar') ||
    nameLower.includes('hln') || nameLower.includes('newsnation') || nameLower.includes('newsmax') ||
    nameLower.includes('one america news') || nameLower.includes('yahoo finance') || nameLower.includes('livenow')
  ) {
    return 'News';
  }

  // 6. Kids & Family
  if (
    rawCat.includes('kid') || rawCat.includes('animat') || rawCat.includes('cartoon') ||
    nameLower.includes('disney') || nameLower.includes('nick') || nameLower.includes('pogo') ||
    nameLower.includes('boomerang') || nameLower.includes('hungama') || nameLower.includes('discovery kids') ||
    nameLower.includes('baby') || nameLower.includes('cbeebies') || nameLower.includes('toon') ||
    nameLower.includes('pbs kids') || nameLower.includes('universal kids')
  ) {
    return 'Kids';
  }

  // 7. Music
  if (
    rawCat.includes('music') || nameLower.includes('music') || nameLower.includes('mtv') ||
    nameLower.includes('9xm') || nameLower.includes('vh1') || nameLower.includes('sangeet') ||
    nameLower.includes('zing') || nameLower.includes('b4u music') || nameLower.includes('channel v') ||
    nameLower.includes('cmt') || nameLower.includes('axs tv') || nameLower.includes('fuse') ||
    nameLower.includes('circle country')
  ) {
    return 'Music';
  }

  // 8. Documentary
  if (
    rawCat.includes('docum') || nameLower.includes('discovery') || nameLower.includes('history') ||
    nameLower.includes('nat geo') || nameLower.includes('national geographic') ||
    nameLower.includes('animal planet') || nameLower.includes('science') || nameLower.includes('bbc earth') ||
    nameLower.includes('smithsonian') || nameLower.includes('investigation discovery') ||
    nameLower.includes('crime & investigation') || nameLower.includes('oxygen true crime') ||
    nameLower.includes('destination america') || nameLower.includes('vice tv')
  ) {
    return 'Documentary';
  }

  // 9. Indian Channels
  if (
    rawCat.includes('indian') || rawCat.includes('hindi') || nameLower.includes('star plus') ||
    nameLower.includes('sony sab') || nameLower.includes('zee tv') || nameLower.includes('colors') ||
    nameLower.includes('sun tv') || nameLower.includes('star jalsha') || nameLower.includes('zee bangla') ||
    nameLower.includes('colors hindi') || nameLower.includes('set india') || nameLower.includes('sab tv')
  ) {
    return 'Indian';
  }

  // 10. Religious
  if (
    rawCat.includes('relig') || rawCat.includes('islam') || nameLower.includes('islam') ||
    nameLower.includes('quran') || nameLower.includes('peace tv') || nameLower.includes('makkah') ||
    nameLower.includes('madinah') || nameLower.includes('harmony') || nameLower.includes('church') ||
    nameLower.includes('tbn') || nameLower.includes('ewtn') || nameLower.includes('daystar')
  ) {
    return 'Religious';
  }

  // 11. Lifestyle & Cooking
  if (
    rawCat.includes('lifestyle') || nameLower.includes('food') || nameLower.includes('tlc') ||
    nameLower.includes('hgtv') || nameLower.includes('fashion') || nameLower.includes('cooking') ||
    nameLower.includes('fyi tv') || nameLower.includes('outdoor channel') || nameLower.includes('diy')
  ) {
    return 'Lifestyle';
  }

  // 12. Entertainment
  if (
    rawCat.includes('entertain') || rawCat === 'tv' || groupTitle === 'tv' ||
    nameLower.includes('zee') || nameLower.includes('star') || nameLower.includes('sony') ||
    nameLower.includes('drama') || nameLower.includes('series') || nameLower.includes('abc') ||
    nameLower.includes('cbs') || nameLower.includes('nbc') || nameLower.includes('fox') ||
    nameLower.includes('cw') || nameLower.includes('fx') || nameLower.includes('tbs') ||
    nameLower.includes('tnt') || nameLower.includes('usa network') || nameLower.includes('bet') ||
    nameLower.includes('bravo') || nameLower.includes('comedy central') || nameLower.includes('court tv') ||
    nameLower.includes('cozi') || nameLower.includes('e! entertainment') || nameLower.includes('freeform') ||
    nameLower.includes('game show') || nameLower.includes('grit') || nameLower.includes('ion tv') ||
    nameLower.includes('law & crime') || nameLower.includes('lifetime') || nameLower.includes('metv') ||
    nameLower.includes('paramount') || nameLower.includes('pop tv') || nameLower.includes('reelz') ||
    nameLower.includes('syfy') || nameLower.includes('trutv') || nameLower.includes('tv land') ||
    nameLower.includes('tv one') || nameLower.includes('telemundo') || nameLower.includes('univision') ||
    nameLower.includes('we tv') || nameLower.includes('buzzr') || nameLower.includes('bounce tv') ||
    nameLower.includes('adult swim') || nameLower.includes('a&e') || nameLower.includes('fetv') ||
    nameLower.includes('itv1')
  ) {
    return 'Entertainment';
  }

  // Fallback if existing category string exists
  if (channel.category && channel.category.trim()) {
    const clean = channel.category.trim();
    // Capitalize first letter
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return 'General';
}

/**
 * Normalizes all channels in an array to have exact categorized names and verified high-res logos.
 */
export function normalizeChannelsList<T extends Partial<Channel> & { name: string; iconUrl?: string; category?: string }>(channelsList: T[]): T[] {
  return channelsList.map(ch => ({
    ...ch,
    category: getExactChannelCategory(ch),
    iconUrl: getChannelLogo(ch)
  }));
}
