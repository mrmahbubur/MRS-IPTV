const fs = require('fs');
const channels = [{name: 'Test', id: '1', category: 'General'}];

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateMockProgram(category, channelName) {
  const now = new Date();
  const hour = now.getHours();
  
  const pool = ['Primetime Drama'];
  
  const cat = category?.toLowerCase() || '';
  const nameLower = channelName?.toLowerCase() || '';
  
  const hashCurrent = hashCode(channelName + hour);
  const hashNext = hashCode(channelName + (hour + 1));
  
  return {
    current: pool[hashCurrent % pool.length],
    next: pool[hashNext % pool.length]
  };
}

async function applyEPGToChannels(channels, epgUrl) {
  const updatedChannels = [...channels];
  const now = new Date();
  
  let epgPrograms = [];
  
  updatedChannels.forEach(channel => {
    let currentTitle = 'No Program Found';
    let nextTitle = 'No Program Found';
    
    // 2. Fallback to mock generator
    if (currentTitle === 'No Program Found') {
       const mock = generateMockProgram(channel.category || 'General', channel.name);
       currentTitle = mock.current;
       nextTitle = mock.next;
    }
    channel.currentProgram = currentTitle;
    channel.nextProgram = nextTitle;
  });
  
  return updatedChannels;
}

applyEPGToChannels(channels).then(c => console.log(c)).catch(e => console.error(e));
