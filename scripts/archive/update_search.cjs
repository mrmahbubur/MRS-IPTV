const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add Search icon to import
content = content.replace(
  /import \{ Tv, Flame, Menu, X, Radio, Users, Compass, Play, Heart \} from 'lucide-react';/,
  `import { Tv, Flame, Menu, X, Radio, Users, Compass, Play, Heart, Search } from 'lucide-react';`
);

// Add search state
content = content.replace(
  /const \[filterTab, setFilterTab\] = useState<'all' \| 'favorites' \| 'sports' \| 'news' \| 'movies' \| 'country'>\('all'\);/,
  `const [filterTab, setFilterTab] = useState<'all' | 'favorites' | 'sports' | 'news' | 'movies' | 'country'>('all');
  const [searchQuery, setSearchQuery] = useState('');`
);

// Update getFilteredChannels
content = content.replace(
  /const getFilteredChannels = \(\) => \{\n    return channels\n      \.filter\(\(c\) => \{\n        if \(filterTab === 'all'\) return true;\n        if \(filterTab === 'favorites'\) return favorites\.includes\(c\.id\);\n        return c\.category === filterTab;\n      \}\)/,
  `const getFilteredChannels = () => {
    return channels
      .filter((c) => {
        const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.category.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
        
        if (filterTab === 'all') return true;
        if (filterTab === 'favorites') return favorites.includes(c.id);
        return c.category === filterTab;
      })`
);

// Add search input before the filter tabs
content = content.replace(
  /<div className="grid grid-cols-3 gap-1\.5 bg-gray-50 p-1 rounded-xl border border-gray-200 mb-4">/,
  `<div className="relative mb-3">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search channels..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200 mb-4">`
);

fs.writeFileSync('src/App.tsx', content);
