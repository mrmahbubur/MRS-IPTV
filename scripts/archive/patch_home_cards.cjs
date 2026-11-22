const fs = require('fs');
let content = fs.readFileSync('src/components/Home.tsx', 'utf8');

// Add Star to imports
content = content.replace(/import \{ ChevronRight/, `import { Star, ChevronRight`);

// Helper function to render a heart/star toggle
const toggleFavoriteBtn = `
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (favorites.includes(channel.id)) {
                      setFavorites(favorites.filter(id => id !== channel.id));
                    } else {
                      setFavorites([...favorites, channel.id]);
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-md hover:bg-white/20 transition-colors z-20"
                >
                  <Star className={\`w-4 h-4 \${favorites.includes(channel.id) ? 'fill-yellow-500 text-yellow-500' : 'text-white'}\`} />
                </button>
`;

// Insert into ChannelGrid
content = content.replace(/<div className="w-full aspect-video flex items-center justify-center p-2 mb-2 group-hover:scale-105 transition-transform duration-300">/g, 
  toggleFavoriteBtn + '\n                <div className="w-full aspect-video flex items-center justify-center p-2 mb-2 group-hover:scale-105 transition-transform duration-300">'
);

// Add copyright footer at the end of the Home component before the last closing div of the main container
content = content.replace(/\{(\/\* Why Choose Shahin TV \*\/[\s\S]*?)<\/div>\s*<\/div>\s*\);\s*\};/g, 
  `{$1
        {/* Footer */}
        <footer className="mt-12 py-6 border-t border-white/10 text-center">
          <p className="text-gray-500 text-sm">
            Designed & Developed by <a href="https://gravatar.com/mrxshahin" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 font-semibold transition-colors">mrxshahin</a>
          </p>
        </footer>
      </div>
    </div>
  );
};`
);

fs.writeFileSync('src/components/Home.tsx', content);
