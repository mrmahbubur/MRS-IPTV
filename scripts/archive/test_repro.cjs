async function fetchPlaylist(url, name) {
  try {
    const res = await fetch('http://localhost:12345/api/proxy?url=' + encodeURIComponent(url));
    if (!res.ok) {
      return '';
    }
    return await res.text();
  } catch (e) {
    console.error(`Failed to load ${name} playlist`, e);
    return '';
  }
}

Promise.all([
  fetchPlaylist('https://iptv-org.github.io/iptv/regions/asia.m3u', 'asia'),
]).then(([data1]) => {
  let idCounter = 1000;
  
  const parseM3u = (data, prefix) => {
    const lines = data.split('\n');
    return lines;
  };
  
  const parsed1 = parseM3u(data1, 'asia');
  
  Promise.resolve(parsed1)
    .then(epgChannels => {
       console.log('EPG then');
    })
    .catch(err => {
      console.error("EPG Error", err);
    });
})
.catch(err => {
  console.error("Fetch error:", err);
  console.log(err.message);
});
