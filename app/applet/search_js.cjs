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
  const code = js.body;

  const regexes = [
    /https:\/\/res\.cloudinary\.com\/[^\s"'`]+/g,
    /https:\/\/[a-zA-Z0-9\.\-_]+\/v1_1\/[^\s"'`]+/g,
    /api\.cloudinary\.com\/[^\s"'`]+/g,
    /\/api\/[^\s"'`]+/g,
    /collection[a-zA-Z0-9_\-\/]+/gi
  ];

  for (const r of regexes) {
    const matches = code.match(r) || [];
    console.log('Matches:', [...new Set(matches)].slice(0, 20));
  }
}

main();
