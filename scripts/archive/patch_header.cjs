const fs = require('fs');
let content = fs.readFileSync('src/components/TopHeader.tsx', 'utf8');

// Update Logo
content = content.replace(
  /<div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">\s*<span className="text-white font-bold text-xs">STV<\/span>\s*<\/div>/,
  `<div className="flex items-center scale-75 origin-left">
                <div className="w-3 h-6 bg-gradient-to-b from-yellow-400 to-orange-600 rounded-l-full transform -rotate-12 translate-x-1"></div>
                <div className="w-4 h-8 bg-gradient-to-b from-orange-500 to-red-600 rounded-full z-10"></div>
                <div className="w-3 h-6 bg-gradient-to-b from-yellow-400 to-orange-600 rounded-r-full transform rotate-12 -translate-x-1"></div>
           </div>`
);

content = content.replace(
  /<h1 className="text-lg font-bold text-white tracking-wide">SHAHINTV<\/h1>/,
  `<h1 className="text-xl font-black text-white tracking-tight -ml-2"><span className="text-orange-500">SHAHIN</span>TV</h1>`
);

fs.writeFileSync('src/components/TopHeader.tsx', content);
