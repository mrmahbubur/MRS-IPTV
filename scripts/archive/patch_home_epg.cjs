const fs = require('fs');
let home = fs.readFileSync('src/components/Home.tsx', 'utf8');

// Update ChannelGrid
home = home.replace(
  /<h4 className="text-xs font-medium text-gray-400 truncate text-center w-full">\{channel\.name\}<\/h4>\s*\{channel\.category && \(\s*<span className="text-\[10px\] text-orange-500\/80 mt-1">\{channel\.category\}<\/span>\s*\)\}/g,
  `<h4 className="text-xs font-medium text-gray-300 truncate text-center w-full mb-1">{channel.name}</h4>
                  {channel.currentProgram && (
                    <div className="w-full flex flex-col items-center mt-1">
                      <span className="text-[10px] text-orange-500 truncate w-full text-center font-semibold">Now: {channel.currentProgram}</span>
                      {channel.nextProgram && (
                        <span className="text-[9px] text-gray-500 truncate w-full text-center">Next: {channel.nextProgram}</span>
                      )}
                    </div>
                  )}`
);

// Also update Live TV section
home = home.replace(
  /<h4 className="text-xs font-medium text-gray-400 truncate text-center w-full">\{channel\.name\}<\/h4>/g,
  `<h4 className="text-xs font-medium text-gray-300 truncate text-center w-full mb-1">{channel.name}</h4>
                {channel.currentProgram && (
                  <div className="w-full flex flex-col items-center mt-1">
                    <span className="text-[10px] text-orange-500 truncate w-full text-center font-semibold">Now: {channel.currentProgram}</span>
                    {channel.nextProgram && (
                      <span className="text-[9px] text-gray-500 truncate w-full text-center">Next: {channel.nextProgram}</span>
                    )}
                  </div>
                )}`
);


fs.writeFileSync('src/components/Home.tsx', home);
