async function test() {
  const fetchPlaylist = async (url, name) => {
    try {
      const res = await fetch('http://localhost:12345/api/proxy?url=' + encodeURIComponent(url));
      if (!res.ok) {
        return '';
      }
      return await res.text();
    } catch (e) {
      console.log('Caught in fetchPlaylist', e.message);
      return '';
    }
  };
  
  Promise.all([
    fetchPlaylist('https://iptv-org.github.io/iptv/regions/asia.m3u', 'asia'),
  ]).then(([data1]) => {
    console.log('Inside then');
  }).catch(err => {
    console.log('Caught in Promise.all catch', err.message);
  });
}
test();
