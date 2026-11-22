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
  const collectionId = 'fee6d5a00f6dd6f5d0c387c8b40356d3';
  const url = `https://collection.cloudinary.com/mycmry4m/${collectionId}`;
  
  // Let's test different Cloudinary API endpoints for collections
  const apis = [
    `https://collection.cloudinary.com/api/v1/collections/mycmry4m/${collectionId}`,
    `https://collection.cloudinary.com/api/v1/collections/${collectionId}`,
    `https://res.cloudinary.com/mycmry4m/image/list/${collectionId}.json`,
    `https://collection.cloudinary.com/v1/mycmry4m/collections/${collectionId}`,
    `https://collection.cloudinary.com/v1/collections/${collectionId}`,
    `https://collection.cloudinary.com/mycmry4m/${collectionId}/manifest.json`,
  ];

  for (const api of apis) {
    const res = await get(api);
    console.log('API:', api, 'Status:', res.status, 'Len:', res.body.length, 'Content-Type:', res.headers['content-type']);
    if (res.status === 200 && !res.body.startsWith('<!doctype') && !res.body.startsWith('<!--')) {
      console.log('RESPONSE BODY:', res.body.slice(0, 500));
    }
  }
}

main();
