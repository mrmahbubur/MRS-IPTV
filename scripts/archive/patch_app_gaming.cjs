const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Replace bg-black with bg-gaming-grid
appContent = appContent.replace(
  /<div className="flex w-full h-screen bg-black text-white overflow-hidden font-sans select-none relative">/,
  '<div className="flex w-full h-screen bg-gaming-grid text-white overflow-hidden font-sans select-none relative">'
);

// Sidebar background
appContent = appContent.replace(
  /className="w-72 sm:w-80 bg-black flex flex-col h-full border-r border-gray-900 shadow-2xl"/,
  'className="w-72 sm:w-80 bg-[#0a0303]/90 backdrop-blur-md flex flex-col h-full border-r-2 border-red-900/50 shadow-[4px_0_24px_rgba(220,38,38,0.2)]"'
);

// Sidebar header
appContent = appContent.replace(
  /className="p-4 flex items-center justify-between border-b border-gray-900"/,
  'className="p-4 flex items-center justify-between border-b-2 border-red-900/50 bg-gradient-to-r from-red-950/40 to-transparent"'
);
appContent = appContent.replace(
  /<Tv className="w-5 h-5 text-lime-500" \/>/,
  '<Tv className="w-5 h-5 text-red-500" style={{ filter: "drop-shadow(0 0 5px rgba(239,68,68,0.8))" }} />'
);

// Expanded category colors
appContent = appContent.replace(
  /'bg-\[#0c7c8c\]\/20 text-\[#0c7c8c\] font-bold'/,
  "'bg-red-950/40 text-red-400 font-bold border-l-2 border-red-500'"
);

// Selected channel colors
appContent = appContent.replace(
  /'bg-\[#0c7c8c\] text-white' : 'hover:bg-white\/5 text-gray-400'/,
  "'bg-gradient-to-r from-red-900/60 to-red-950/20 text-white border-l-2 border-red-500 shadow-[inset_0_0_10px_rgba(220,38,38,0.2)]' : 'hover:bg-white/5 text-gray-400'"
);

// Main Player area background
appContent = appContent.replace(
  /<div className="flex-1 relative bg-black flex flex-col h-full overflow-hidden w-full">/,
  '<div className="flex-1 relative bg-transparent flex flex-col h-full overflow-hidden w-full p-2 sm:p-6">'
);

fs.writeFileSync('src/App.tsx', appContent);
