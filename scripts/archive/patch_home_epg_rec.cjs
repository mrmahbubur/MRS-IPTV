const fs = require('fs');
let home = fs.readFileSync('src/components/Home.tsx', 'utf8');

home = home.replace(
  /<div className="absolute bottom-0 left-0 right-0 p-3 flex justify-center z-10">\s*<h4 className="text-\[10px\] lg:text-xs font-bold text-orange-500 tracking-wider text-center truncate w-full">\{channel\.name\}<\/h4>\s*<\/div>\s*<div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black to-transparent">\s*<h4 className="text-xs lg:text-sm font-bold text-white truncate text-center">\{channel\.name\}<\/h4>\s*<\/div>/g,
  `<div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col justify-end z-10 bg-gradient-to-t from-black via-black/80 to-transparent pt-10">
                  <h4 className="text-xs lg:text-sm font-bold text-white truncate text-center">{channel.name}</h4>
                  {channel.currentProgram && (
                    <span className="text-[10px] text-orange-500 truncate w-full text-center mt-1">Now: {channel.currentProgram}</span>
                  )}
                </div>`
);
fs.writeFileSync('src/components/Home.tsx', home);
