const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

homeContent = homeContent.replace(
  /interface HomeProps \{\n  channels: Channel\[\];\n  onSelectChannel: \(channel: Channel\) => void;\n\}/g,
  `interface HomeProps {\n  channels: Channel[];\n  onSelectChannel: (channel: Channel) => void;\n  searchQuery?: string;\n}`
);

homeContent = homeContent.replace(
  /export const Home: React\.FC<HomeProps> = \(\{ channels, onSelectChannel \}\) => \{/g,
  `export const Home: React.FC<HomeProps> = ({ channels, onSelectChannel, searchQuery = '' }) => {`
);

const searchView = `
  if (searchQuery.trim().length > 0) {
    const searchResults = channels.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.category && c.category.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 lg:pb-8">
        <div className="p-4 lg:p-8 space-y-6">
          <div className="flex items-center gap-4">
             <h2 className="text-xl lg:text-2xl font-bold text-white">Search Results for "{searchQuery}"</h2>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
             {searchResults.map(channel => (
                <div 
                  key={channel.id} 
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
                  <h4 className="text-xs font-medium text-gray-400 truncate text-center w-full">{channel.name}</h4>
                  {channel.category && (
                    <span className="text-[10px] text-orange-500/80 mt-1">{channel.category}</span>
                  )}
                </div>
             ))}
             {searchResults.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500">
                   No channels found matching "{searchQuery}".
                </div>
             )}
          </div>
        </div>
      </div>
    );
  }
`;

homeContent = homeContent.replace(
  /if \(selectedCategory\) \{/g,
  searchView + '\n  if (selectedCategory) {'
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
