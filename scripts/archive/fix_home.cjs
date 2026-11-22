const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

homeContent = homeContent.replace(
  /<div className="absolute bottom-\[-10px\] left-1\/2 -translate-x-1\/2 bg-red-600 text-white text-\[9px\] font-bold px-3 py-0\.5 rounded-full z-10 opacity-0 group-hover:opacity-100 transition-opacity">LIVE<\/div>\n\s*<\/div>\n\s*<div className="grid grid-cols-4 lg:grid-cols-8 gap-4 lg:gap-6">/g,
  '<div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 bg-red-600 text-white text-[9px] font-bold px-3 py-0.5 rounded-full z-10 opacity-0 group-hover:opacity-100 transition-opacity">LIVE</div>\n              </div>\n            ))}\n          </div>\n        </section>\n\n        {/* Categories */}\n        <section>\n          <div className="flex items-center gap-2 mb-4">\n            <Grid className="w-5 h-5 text-gray-400" />\n            <h3 className="text-lg lg:text-xl font-semibold text-white">Categories</h3>\n          </div>\n          <div className="grid grid-cols-4 lg:grid-cols-8 gap-4 lg:gap-6">'
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
