const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Remove the floating menu button
appContent = appContent.replace(
  /\{\/\* Top Header to trigger sidebar if closed \*\/\}\s*\{!isSidebarOpen && \(\s*<div className="absolute top-4 left-4 z-40">\s*<button[\s\S]*?<Menu className="w-5 h-5" \/>\s*<\/button>\s*<\/div>\s*\)\}/,
  ''
);

fs.writeFileSync('src/App.tsx', appContent);
