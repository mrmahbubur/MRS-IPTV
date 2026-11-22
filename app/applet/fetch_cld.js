const https = require('https');

function get(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
  });
}

async function main() {
  const js = await get('https://collection.cloudinary.com/main.6c2764cea5ebbd93.js');
  
  const matches = js.body.match(/https?:\/\/[a-zA-Z0-9\.\-\_\/]+/g) || [];
  console.log('Domains/URLs:', [...new Set(matches)]);

  const pathMatches = js.body.match(/["']\/[a-zA-Z0-9\-\_\/]+["']/g) || [];
  console.log('Paths:', [...new Set(pathMatches)].filter(p => p.includes('collection') || p.includes('asset') || p.includes('v1') || p.includes('cloud') || p.includes('api')));
}

main();
