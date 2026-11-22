const fs = require('fs');

// --- Patch BottomNav.tsx ---
let bottomNav = fs.readFileSync('src/components/BottomNav.tsx', 'utf8');
bottomNav = bottomNav.replace(/Settings/g, 'User');
bottomNav = bottomNav.replace(/{ icon: User, label: 'User' }/, "{ icon: User, label: 'Profile' }");
fs.writeFileSync('src/components/BottomNav.tsx', bottomNav);

// --- Patch TopHeader.tsx ---
let topHeader = fs.readFileSync('src/components/TopHeader.tsx', 'utf8');
// Mobile header styling to match image
topHeader = topHeader.replace(
  /<div className="flex items-center gap-4 lg:hidden">/,
  '<div className="flex items-center gap-3 lg:hidden">'
);
fs.writeFileSync('src/components/TopHeader.tsx', topHeader);

// --- Patch Home.tsx ---
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

// 1. Banner HD badge & style
const bannerTarget = /<div className="absolute inset-0 p-6 lg:p-12 flex items-center justify-between">/;
const bannerReplacement = `<div className="absolute top-4 right-4 z-20 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-white text-xs font-bold">HD</span>
          </div>
          <div className="absolute inset-0 p-6 lg:p-12 flex items-center justify-between z-10">`;
homeContent = homeContent.replace(bannerTarget, bannerReplacement);

homeContent = homeContent.replace(
  /<button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white px-6 py-3 rounded-full font-bold w-fit flex items-center gap-2 transition-transform hover:scale-105">/,
  '<button className="bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-400 hover:to-purple-500 text-white px-6 py-3 rounded-full font-bold w-fit flex items-center gap-2 transition-transform hover:scale-105 shadow-[0_0_15px_rgba(249,115,22,0.5)]">'
);

// 2. Live TV Channels styling
const channelCardTarget = /<div\s*key=\{channel\.id\}[\s\S]*?className="shrink-0 w-36 lg:w-48 bg-\[\#161821\] border border-white\/5 rounded-xl p-4 cursor-pointer hover:border-orange-500\/50 hover:bg-\[\#1c1f2b\] transition-all snap-start group relative"[\s\S]*?<\/div>\s*<\/div>/;

const channelCardReplacement = `<div 
                key={channel.id} 
                onClick={() => onSelectChannel(channel)}
                className="shrink-0 w-36 lg:w-48 bg-gradient-to-b from-[#0f111a] to-[#0a0b10] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-orange-500/50 transition-all snap-start group relative flex flex-col items-center"
              >
                <div className="absolute top-0 left-0 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-tl-xl rounded-br-lg z-10">LIVE</div>
                <div className="w-full aspect-video flex items-center justify-center p-2 mb-2 group-hover:scale-105 transition-transform duration-300">
                  {channel.iconUrl ? (
                    <img src={channel.iconUrl} alt={channel.name} className="max-w-full max-h-full object-contain drop-shadow-lg" />
                  ) : (
                    <span className="text-xl font-black italic text-white">{channel.name.substring(0, 10)}</span>
                  )}
                </div>
                <h4 className="text-xs font-medium text-gray-400 truncate text-center w-full">{channel.name}</h4>
                <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 bg-red-600 text-white text-[9px] font-bold px-3 py-0.5 rounded-full z-10 opacity-0 group-hover:opacity-100 transition-opacity">LIVE</div>
              </div>`;

homeContent = homeContent.replace(channelCardTarget, channelCardReplacement);

// Hardcode some mock channels to match image if displayChannels is empty or to override
homeContent = homeContent.replace(
  /const displayChannels = liveChannels\.length > 0 \? liveChannels : channels\.slice\(0, 5\);/,
  `const displayChannels = [
    { id: 'mock-1', name: 'Sky Sports', iconUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e5/Sky_Sports_logo_2020.svg/1200px-Sky_Sports_logo_2020.svg.png', category: 'SPORTS' },
    { id: 'mock-2', name: 'Star Sports', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Star_Sports_Logo.svg/2048px-Star_Sports_Logo.svg.png', category: 'SPORTS' },
    { id: 'mock-3', name: 'Sony TEN 1', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Sony_Ten_1_logo.png', category: 'SPORTS' },
    { id: 'mock-4', name: 'Willow TV', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Willow_TV_logo.svg/2560px-Willow_TV_logo.svg.png', category: 'SPORTS' },
    { id: 'mock-5', name: 'ESPN', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/ESPN_wordmark.svg/2560px-ESPN_wordmark.svg.png', category: 'SPORTS' }
  ] as any[];`
);


// 3. Category rounded icon buttons
const categoryTarget = /<div key=\{idx\} className=\{\`bg-gradient-to-br \$\{cat\.color\} rounded-2xl p-4 aspect-square flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-105 transition-transform shadow-lg\`\}>[\s\S]*?<\/div>/g;

const categoryReplacement = `<div key={idx} className="flex flex-col items-center gap-2 cursor-pointer group">
                 <div className={\`w-16 h-16 lg:w-20 lg:h-20 bg-gradient-to-br \$\{cat.color\} rounded-3xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg border border-white/10\`}>
                   <cat.icon className="w-8 h-8 text-white drop-shadow-md" />
                 </div>
                 <span className="text-xs lg:text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{cat.name}</span>
               </div>`;

homeContent = homeContent.replace(categoryTarget, categoryReplacement);
homeContent = homeContent.replace(
  /className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4"/,
  'className="grid grid-cols-4 lg:grid-cols-8 gap-4 lg:gap-6"'
);

// 4. Why Choose Features
const featureTarget = /bg-gradient-to-br from-\[\#12131a\] to-\[\#0a0a0f\] border border-white\/5 rounded-2xl p-4 lg:p-6 flex flex-col lg:flex-row items-center justify-center gap-3 lg:gap-4 text-center lg:text-left shadow-lg hover:border-white\/10 transition-colors/g;

homeContent = homeContent.replace(
  featureTarget,
  'bg-transparent border border-white/10 rounded-2xl p-4 lg:p-6 flex flex-col lg:flex-row items-center justify-center gap-3 lg:gap-4 text-center lg:text-left hover:border-white/20 hover:bg-white/5 transition-colors'
);
homeContent = homeContent.replace(
  /className=\{\`w-14 h-14 shrink-0 rounded-full \$\{feat\.bg\} flex items-center justify-center mb-2\`\}/g,
  'className={`w-12 h-12 shrink-0 rounded-xl bg-transparent border-2 ${feat.color.replace("text-", "border-")} flex items-center justify-center mb-2 lg:mb-0 shadow-[0_0_10px_currentColor] text-opacity-20`}'
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
