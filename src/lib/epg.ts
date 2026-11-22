import { Channel } from '../types';

export interface EPGProgram {
  id: string;
  channelId: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
}

// Parses XMLTV date format like "20260713143000 +0000"
function parseXMLTVDate(dateStr: string): Date {
  if (!dateStr || dateStr.length < 14) return new Date();
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(dateStr.substring(8, 10));
  const min = parseInt(dateStr.substring(10, 12));
  const sec = parseInt(dateStr.substring(12, 14));
  
  // Basic fallback without timezone calculation for simplicity
  return new Date(Date.UTC(year, month, day, hour, min, sec));
}

export async function fetchEPG(url: string): Promise<EPGProgram[]> {
  try {
    const proxyUrl = url.startsWith('/') ? url : '/api/proxy?url=' + encodeURIComponent(url);
    const response = await fetch(proxyUrl).catch(() => null);
    if (!response || !response.ok) return [];
    
    const xmlString = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    const programs: EPGProgram[] = [];
    const programmeNodes = xmlDoc.getElementsByTagName('programme');
    
    for (let i = 0; i < programmeNodes.length; i++) {
      const node = programmeNodes[i];
      const channelId = node.getAttribute('channel') || '';
      const startStr = node.getAttribute('start') || '';
      const stopStr = node.getAttribute('stop') || '';
      
      const titleNode = node.getElementsByTagName('title')[0];
      const descNode = node.getElementsByTagName('desc')[0];
      
      programs.push({
        id: Math.random().toString(36).substring(7),
        channelId,
        title: titleNode ? titleNode.textContent || 'Unknown Program' : 'Unknown Program',
        description: descNode ? descNode.textContent || '' : '',
        startTime: parseXMLTVDate(startStr),
        endTime: parseXMLTVDate(stopStr),
      });
    }
    
    return programs;
  } catch (error) {
    console.error('Failed to fetch XMLTV EPG:', error);
    return [];
  }
}

function getLiveStreamProgramMetadata(category: string, channelName: string) {
  const catLabel = category ? `${category} Live` : 'Live TV';
  return {
    current: `${channelName} • ${catLabel} Broadcast`,
    next: `Continuous ${catLabel} Feed`,
  };
}

export async function applyEPGToChannels(channels: Channel[], epgUrl?: string): Promise<Channel[]> {
  const updatedChannels = [...channels];
  const now = new Date();
  
  let epgPrograms: EPGProgram[] = [];
  if (epgUrl) {
     epgPrograms = await fetchEPG(epgUrl);
  }
  
  updatedChannels.forEach(channel => {
    let currentTitle = channel.currentProgram && channel.currentProgram !== 'No Program Found' ? channel.currentProgram : 'No Program Found';
    let nextTitle = channel.nextProgram && channel.nextProgram !== 'No Program Found' ? channel.nextProgram : 'No Program Found';

    // 1. Try real XMLTV EPG match
    if (currentTitle === 'No Program Found' && epgPrograms.length > 0) {
      const channelPrograms = epgPrograms.filter(p => p.channelId === channel.id || channel.name.toLowerCase().includes(p.channelId.toLowerCase()));
      
      if (channelPrograms.length > 0) {
        const current = channelPrograms.find(p => p.startTime <= now && p.endTime > now);
        const next = channelPrograms.find(p => p.startTime > now);
        
        if (current) currentTitle = current.title;
        if (next) nextTitle = next.title;
      }
    }
    
    // 2. Fallback to real live channel metadata (no fake show names)
    if (currentTitle === 'No Program Found') {
       const liveMeta = getLiveStreamProgramMetadata(channel.category || 'General', channel.name);
       currentTitle = liveMeta.current;
       nextTitle = liveMeta.next;
    }

    channel.currentProgram = currentTitle;
    channel.nextProgram = nextTitle;
  });
  
  return updatedChannels;
}
