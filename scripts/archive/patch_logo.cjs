const fs = require('fs');

let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sidebar = sidebar.replace(
  /<img src="\/logo\.png" alt="Shahin TV"/g,
  '<img src="https://i.postimg.cc/HnQrWSjz/Chat-GPT-Image-Jul-13-2026-12-02-26-AM.png" alt="Shahin TV"'
);
fs.writeFileSync('src/components/Sidebar.tsx', sidebar);

let topHeader = fs.readFileSync('src/components/TopHeader.tsx', 'utf8');
topHeader = topHeader.replace(
  /<img src="\/logo\.png" alt="Shahin TV"/g,
  '<img src="https://i.postimg.cc/HnQrWSjz/Chat-GPT-Image-Jul-13-2026-12-02-26-AM.png" alt="Shahin TV"'
);
fs.writeFileSync('src/components/TopHeader.tsx', topHeader);
