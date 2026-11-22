const fs = require('fs');
const content = fs.readFileSync('src/components/Home.tsx', 'utf8');

const channelGridCode = `  const ChannelGrid = ({ title, channelsList }: { title: string, channelsList: Channel[] }) => {
    const [sortBy, setSortBy] = React.useState<'popularity' | 'alphabetical'>('popularity');
    const sortedChannels = [...channelsList].sort((a, b) => {
      if (sortBy === 'alphabetical') {
        return a.name.localeCompare(b.name);
      } else {
        return (b.viewersCount || 0) - (a.viewersCount || 0);
      }
    });

    return (
    <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 lg:pb-8">
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
             {title !== 'Search Results' && (
               <button 
                  onClick={() => setActiveView('home')}
                  className="w-10 h-10 shrink-0 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
               >
                  <ChevronRight className="w-6 h-6 text-white transform rotate-180" />
               </button>
             )}
             <h2 className="text-xl sm:text-2xl font-bold text-white truncate">{title}</h2>
          </div>
          {title !== 'Search Results' && title !== 'All Categories' && (
             <div className="flex shrink-0 items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                <button onClick={() => setSortBy('popularity')} className={\`px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-colors \${sortBy === 'popularity' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}\`}>Popularity</button>
                <button onClick={() => setSortBy('alphabetical')} className={\`px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-colors \${sortBy === 'alphabetical' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}\`}>A-Z</button>
             </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
           {sortedChannels.map(channel => (
              <div 
                key={channel.id} 
                onClick={() => onSelectChannel(channel)}
                className="w-full bg-gradient-to-b from-[#0f111a] to-[#0a0b10] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-orange-500/50 transition-all group relative flex flex-col items-center snap-start"
              >
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (favorites.includes(channel.id)) {
                      setFavorites(favorites.filter((id: string) => id !== channel.id));
                    } else {
                      setFavorites([...favorites, channel.id]);
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-md hover:bg-white/20 transition-colors z-20"
                >
                  <Star className={\`w-4 h-4 \${favorites.includes(channel.id) ? 'fill-yellow-500 text-yellow-500' : 'text-white'}\`} />
                </button>

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
                        <span className="text-[9px] text-gray-500 truncate w-full text-center">Next: {channel.nextProgram}</span>
                      )}
                    </div>
                  )}
              </div>
           ))}
           {channelsList.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500">
                 No channels found.
              </div>
           )}
        </div>
      </div>
    </div>
    );
  };`;

const newChannelGrid = `const ChannelGrid = ({ title, channelsList, setActiveView, onSelectChannel, favorites, setFavorites }: { 
  title: string, 
  channelsList: Channel[], 
  setActiveView: (view: string) => void, 
  onSelectChannel: (channel: Channel) => void, 
  favorites: string[], 
  setFavorites: (favorites: string[]) => void 
}) => {
    const [sortBy, setSortBy] = React.useState<'popularity' | 'alphabetical'>('popularity');
    const sortedChannels = [...channelsList].sort((a, b) => {
      if (sortBy === 'alphabetical') {
        return a.name.localeCompare(b.name);
      } else {
        return (b.viewersCount || 0) - (a.viewersCount || 0);
      }
    });

    return (
    <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 lg:pb-8">
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
             {title !== 'Search Results' && (
               <button 
                  onClick={() => setActiveView('home')}
                  className="w-10 h-10 shrink-0 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
               >
                  <ChevronRight className="w-6 h-6 text-white transform rotate-180" />
               </button>
             )}
             <h2 className="text-xl sm:text-2xl font-bold text-white truncate">{title}</h2>
          </div>
          {title !== 'Search Results' && title !== 'All Categories' && (
             <div className="flex shrink-0 items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                <button onClick={() => setSortBy('popularity')} className={\`px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-colors \${sortBy === 'popularity' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}\`}>Popularity</button>
                <button onClick={() => setSortBy('alphabetical')} className={\`px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-colors \${sortBy === 'alphabetical' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}\`}>A-Z</button>
             </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
           {sortedChannels.map(channel => (
              <div 
                key={channel.id} 
                onClick={() => onSelectChannel(channel)}
                className="w-full bg-gradient-to-b from-[#0f111a] to-[#0a0b10] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-orange-500/50 transition-all group relative flex flex-col items-center snap-start"
              >
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (favorites.includes(channel.id)) {
                      setFavorites(favorites.filter((id) => id !== channel.id));
                    } else {
                      setFavorites([...favorites, channel.id]);
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-md hover:bg-white/20 transition-colors z-20"
                >
                  <Star className={\`w-4 h-4 \${favorites.includes(channel.id) ? 'fill-yellow-500 text-yellow-500' : 'text-white'}\`} />
                </button>

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
                        <span className="text-[9px] text-gray-500 truncate w-full text-center">Next: {channel.nextProgram}</span>
                      )}
                    </div>
                  )}
              </div>
           ))}
           {channelsList.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500">
                 No channels found.
              </div>
           )}
        </div>
      </div>
    </div>
    );
  };
`;

let result = content.replace(channelGridCode, '');
result = newChannelGrid + '\n\n' + result;

// Now fix the calls to ChannelGrid
result = result.replace(
  /<ChannelGrid title={\`Search Results for "\\\${searchQuery}"\`} channelsList={searchResults} \/>/g,
  '<ChannelGrid title={`Search Results for "${searchQuery}"`} channelsList={searchResults} setActiveView={setActiveView} onSelectChannel={onSelectChannel} favorites={favorites} setFavorites={setFavorites} />'
);

result = result.replace(
  /<ChannelGrid title="Live TV Channels" channelsList={channels} \/>/g,
  '<ChannelGrid title="Live TV Channels" channelsList={channels} setActiveView={setActiveView} onSelectChannel={onSelectChannel} favorites={favorites} setFavorites={setFavorites} />'
);

result = result.replace(
  /<ChannelGrid title="Your Favorites" channelsList={favoriteChannels} \/>/g,
  '<ChannelGrid title="Your Favorites" channelsList={favoriteChannels} setActiveView={setActiveView} onSelectChannel={onSelectChannel} favorites={favorites} setFavorites={setFavorites} />'
);

result = result.replace(
  /<ChannelGrid title={\`\\\${categoryName} Channels\`} channelsList={categoryChannels} \/>/g,
  '<ChannelGrid title={`${categoryName} Channels`} channelsList={categoryChannels} setActiveView={setActiveView} onSelectChannel={onSelectChannel} favorites={favorites} setFavorites={setFavorites} />'
);

fs.writeFileSync('src/components/Home.tsx', result);
