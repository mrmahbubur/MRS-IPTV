const fs = require('fs');
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

sidebar = sidebar.replace(
  /<img src="\/logo\.png" alt="Shahin TV" className="w-14 h-14 object-contain" \/>\n\s*<\/div>/,
  '<img src="/logo.png" alt="Shahin TV" className="w-14 h-14 object-contain" />'
);

fs.writeFileSync('src/components/Sidebar.tsx', sidebar);
