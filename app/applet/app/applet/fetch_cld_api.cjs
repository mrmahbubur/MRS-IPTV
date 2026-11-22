const https = require('https');

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
  });
}

async function main() {
  const cId = 'fee6d5a00f6dd6f5d0c387c8b40356d3';
  const cloud = 'mycmry4m';

  const endpoints = [
    `https://collection.cloudinary.com/api/v1/collections/public/${cId}`,
    `https://collection.cloudinary.com/api/v1/collections/public/${cloud}/${cId}`,
    `https://collection.cloudinary.com/api/collections/public/${cId}`,
    `https://collection.cloudinary.com/api/collections/public/${cloud}/${cId}`,
    `https://collection.cloudinary.com/api/v1/collections/${cloud}/${cId}`,
    `https://collection.cloudinary.com/api/v1/collections/${cId}`,
    `https://collection.cloudinary.com/v1/collections/public/${cId}`,
    `https://collection.cloudinary.com/v1/collections/public/${cloud}/${cId}`,
  ];

  for (const ep of endpoints) {
    const res = await get(ep);
    console.log('EP:', ep, 'Status:', res.status, 'Len:', res.body.length, 'Body:', res.body.slice(0, 300));
  }
}

main();
