const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add State
content = content.replace(
  /const \[favorites, setFavorites\] = useState<string\[\]>\(\(\) => \{[\s\S]*?\}\);\n\n  useEffect\(\(\) => \{\n    localStorage\.setItem\('shahin_tv_favorites', JSON\.stringify\(favorites\)\);\n  \}, \[favorites\]\);/,
  `const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('shahin_tv_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('shahin_tv_favorites', JSON.stringify(favorites));
  }, [favorites]);

  const [recentlyWatched, setRecentlyWatched] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('shahin_tv_recent');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('shahin_tv_recent', JSON.stringify(recentlyWatched));
  }, [recentlyWatched]);`
);

// Add to handleSelectChannel
content = content.replace(
  /setSelectedChannel\(channel\);\n\n    \/\/ Try to play native video immediately \(if rendered\)/,
  `setSelectedChannel(channel);

    setRecentlyWatched(prev => {
      const filtered = prev.filter(id => id !== channel.id);
      return [channel.id, ...filtered].slice(0, 5);
    });

    // Try to play native video immediately (if rendered)`
);

// Render UI section
content = content.replace(
  /<\/div>\n                  <\/div>\n\n                <\/div>\n\n              <\/div>\n\n            <\/div>\n\n          <\/div>\n        <\/div>\n\n        \{\/\* Footer info bars \*\/\}/,
  `</div>
                  </div>
                  
                  {recentlyWatched.length > 0 && (
                    <div className="bg-white text-gray-900 rounded-2xl p-4 md:p-5 border border-gray-200 shadow-xl space-y-3 mt-4">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-black text-gray-900 tracking-wider uppercase">
                            Recently Watched
                          </h3>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {recentlyWatched.map(id => {
                          const channel = channels.find(c => c.id === id);
                          if (!channel) return null;
                          return (
                            <button
                              key={channel.id}
                              onClick={() => handleSelectChannel(channel)}
                              className="flex items-center gap-3 p-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-lime-500/30 text-left transition-all duration-300 group cursor-pointer"
                            >
                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-black text-gray-900 group-hover:text-gray-900 truncate transition-colors pr-6">
                                  {channel.name}
                                </h4>
                                <p className="text-[9.5px] text-gray-500 truncate mt-0.5">
                                  {channel.category.toUpperCase()}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>

              </div>

            </div>

          </div>
        </div>

        {/* Footer info bars */}`
);

fs.writeFileSync('src/App.tsx', content);
