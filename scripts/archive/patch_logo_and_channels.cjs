const fs = require('fs');

// --- Patch Sidebar.tsx ---
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sidebar = sidebar.replace(
  /<div className="flex flex-col items-center">[\s\S]*?<\/div>\s*<\/div>/,
  '<img src="/logo.png" alt="Shahin TV" className="w-14 h-14 object-contain" />'
);
fs.writeFileSync('src/components/Sidebar.tsx', sidebar);

// --- Patch TopHeader.tsx ---
let topHeader = fs.readFileSync('src/components/TopHeader.tsx', 'utf8');
topHeader = topHeader.replace(
  /<div className="flex items-center scale-75 origin-left">[\s\S]*?<\/div>\s*<\/div>/,
  '<img src="/logo.png" alt="Shahin TV" className="w-10 h-10 object-contain" />'
);
fs.writeFileSync('src/components/TopHeader.tsx', topHeader);

// --- Patch Home.tsx ---
let home = fs.readFileSync('src/components/Home.tsx', 'utf8');

// Update Live TV to only show sports
home = home.replace(
  /const liveChannels = channels\.filter\(c => c\.status === 'live' \|\| true\);\n\s*const displayChannels = liveChannels\.slice\(0, 20\);/,
  "const sportsChannels = channels.filter(c => c.category?.toLowerCase() === 'sports');\n  const displayChannels = sportsChannels.slice(0, 20);"
);

// Remove hardcoded recommendedMovies
home = home.replace(/const recommendedMovies = \[\s*\{ title: 'OPPENHEIMER'[\s\S]*?\];/m, '');

// Use sports channels for recommendations (e.g., skip first 5 to show different ones)
home = home.replace(
  /\{recommendedMovies\.map\(\(movie, idx\)/,
  "{sportsChannels.slice(10, 25).map((channel, idx)"
);

// Update Recommended card UI to use channel data instead of movie data
const recommendedCardOld = /<img src=\{movie\.img\} alt=\{movie\.title\} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" \/>/;
const recommendedCardNew = `<div className="w-full h-full bg-gradient-to-b from-[#1a1c29] to-[#0a0b10] p-4 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                  {channel.iconUrl ? (
                    <img src={channel.iconUrl} alt={channel.name} className="max-w-full max-h-full object-contain drop-shadow-lg" />
                  ) : (
                    <span className="text-xl font-black italic text-white">{channel.name.substring(0, 10)}</span>
                  )}
                </div>`;
home = home.replace(recommendedCardOld, recommendedCardNew);

home = home.replace(
  /<h4 className="text-\[10px\] lg:text-xs font-bold text-orange-500 tracking-wider text-center">\{movie\.title\}<\/h4>/,
  '<h4 className="text-[10px] lg:text-xs font-bold text-orange-500 tracking-wider text-center truncate w-full">{channel.name}</h4>'
);

// Add onClick to recommended items to make them playable
home = home.replace(
  /<div key=\{idx\} className="shrink-0 w-32 md:w-40 lg:w-48 aspect-\[2\/3\] rounded-xl overflow-hidden relative cursor-pointer group snap-start">/g,
  '<div key={idx} onClick={() => onSelectChannel(channel)} className="shrink-0 w-32 md:w-40 lg:w-48 aspect-[2/3] rounded-xl overflow-hidden relative cursor-pointer group snap-start border border-white/5 hover:border-orange-500/50">'
);

fs.writeFileSync('src/components/Home.tsx', home);
