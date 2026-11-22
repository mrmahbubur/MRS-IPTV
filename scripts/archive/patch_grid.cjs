const fs = require('fs');
let content = fs.readFileSync('src/components/Home.tsx', 'utf8');

// Live Sports Channels
content = content.replace(/<div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">\s*\{displayChannels\.map\(channel => \([\s\S]*?<\/div>\s*\)\)\}\s*<\/div>/, `<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayChannels.map(channel => (
              <div 
                key={channel.id} 
                onClick={() => onSelectChannel(channel)}
                className="bg-gradient-to-b from-[#0f111a] to-[#0a0b10] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-orange-500/50 transition-all group relative flex flex-col items-center"
              >
                <div className="absolute top-0 left-0 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-tl-xl rounded-br-lg z-10">LIVE</div>
                <div className="w-full aspect-video flex items-center justify-center p-2 mb-2 group-hover:scale-105 transition-transform duration-300">
                  {channel.iconUrl ? (
                    <img src={channel.iconUrl} alt={channel.name} className="max-w-full max-h-full object-contain drop-shadow-lg" />
                  ) : (
                    <span className="text-xl font-black italic text-white">{channel.name.substring(0, 10)}</span>
                  )}
                </div>
                <h4 className="text-xs font-medium text-gray-300 truncate text-center w-full mb-1">{channel.name}</h4>
                {channel.currentProgram && (
                  <div className="w-full flex flex-col items-center mt-1">
                    <span className="text-[10px] text-orange-500 truncate w-full text-center font-semibold bg-orange-500/10 px-2 py-1 rounded-md">Now: {channel.currentProgram}</span>
                    {channel.nextProgram && (
                      <span className="text-[9px] text-gray-500 truncate w-full text-center mt-0.5">Next: {channel.nextProgram}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>`);

// Recommended For You
content = content.replace(/<div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">\s*\{sportsChannels\.slice\(10, 25\)\.map\(\(channel, idx\) => \([\s\S]*?<\/div>\s*\)\)\}\s*<\/div>/, `<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sportsChannels.slice(10, 25).map((channel, idx) => (
              <div 
                key={idx} 
                onClick={() => onSelectChannel(channel)}
                className="bg-gradient-to-b from-[#0f111a] to-[#0a0b10] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-orange-500/50 transition-all group relative flex flex-col items-center"
              >
                <div className="w-full aspect-video flex items-center justify-center p-2 mb-2 group-hover:scale-105 transition-transform duration-300">
                  {channel.iconUrl ? (
                    <img src={channel.iconUrl} alt={channel.name} className="max-w-full max-h-full object-contain drop-shadow-lg" />
                  ) : (
                    <span className="text-xl font-black italic text-white">{channel.name.substring(0, 10)}</span>
                  )}
                </div>
                <h4 className="text-xs font-medium text-gray-300 truncate text-center w-full mb-1">{channel.name}</h4>
                {channel.currentProgram && (
                  <div className="w-full flex flex-col items-center mt-1">
                    <span className="text-[10px] text-orange-500 truncate w-full text-center font-semibold bg-orange-500/10 px-2 py-1 rounded-md">Now: {channel.currentProgram}</span>
                    {channel.nextProgram && (
                      <span className="text-[9px] text-gray-500 truncate w-full text-center mt-0.5">Next: {channel.nextProgram}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>`);

// ChannelGrid
content = content.replace(/<span className="text-\[10px\] text-orange-500 truncate w-full text-center font-semibold">Now: \{channel\.currentProgram\}<\/span>/, `<span className="text-[10px] text-orange-500 truncate w-full text-center font-semibold bg-orange-500/10 px-2 py-1 rounded-md">Now: {channel.currentProgram}</span>`);

// ChannelList (if there's one)
content = content.replace(/<span className="text-\[10px\] text-orange-500 truncate w-full text-center font-semibold">Now: \{channel\.currentProgram\}<\/span>/g, `<span className="text-[10px] text-orange-500 truncate w-full text-center font-semibold bg-orange-500/10 px-2 py-1 rounded-md">Now: {channel.currentProgram}</span>`);

fs.writeFileSync('src/components/Home.tsx', content);
