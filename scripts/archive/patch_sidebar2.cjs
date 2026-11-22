const fs = require('fs');
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

// Update props
sidebar = sidebar.replace(
  /interface SidebarProps \{[\s\S]*?export const Sidebar: React\.FC<SidebarProps> = \(\{ isMobileMenuOpen, onCloseMobileMenu \}\) => \{/m,
  `interface SidebarProps {
  isMobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileMenuOpen, onCloseMobileMenu, activeView, setActiveView }) => {`
);

// Update nav items
sidebar = sidebar.replace(
  /const mainNav = \[\s*\{ icon: Home, label: 'Home', active: true \},\s*\{ icon: Tv, label: 'Live TV', badge: 'LIVE' \},\s*\{ icon: Activity, label: 'Sports' \},\s*\{ icon: Film, label: 'Movies' \},\s*\{ icon: MonitorPlay, label: 'TV Shows' \},\s*\{ icon: Newspaper, label: 'News' \},\s*\{ icon: Baby, label: 'Kids' \},\s*\{ icon: Music, label: 'Music' \},\s*\{ icon: Globe, label: 'Documentary' \},\s*\{ icon: Compass, label: 'Lifestyle' \},\s*\];/m,
  `const mainNav = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'live', icon: Tv, label: 'Live TV', badge: 'LIVE' },
    { id: 'category:Sports', icon: Activity, label: 'Sports' },
    { id: 'category:Movies', icon: Film, label: 'Movies' },
    { id: 'category:TV Shows', icon: MonitorPlay, label: 'TV Shows' },
    { id: 'category:News', icon: Newspaper, label: 'News' },
    { id: 'category:Kids', icon: Baby, label: 'Kids' },
    { id: 'category:Music', icon: Music, label: 'Music' }
  ];`
);

// Change subNav for favorites
sidebar = sidebar.replace(
  /const subNav = \[\s*\{ icon: Star, label: 'Favorites' \},[\s\S]*?\];/m,
  `const subNav = [
    { id: 'favorites', icon: Star, label: 'Favorites' }
  ];`
);

// Update render items
sidebar = sidebar.replace(
  /\{mainNav\.map\(\(item, idx\) => \([\s\S]*?<\/button>\s*\)\)\}/m,
  `{mainNav.map((item, idx) => {
          const isActive = activeView === item.id;
          return (
          <button
            key={idx}
            onClick={() => {
              setActiveView(item.id);
              if (onCloseMobileMenu) onCloseMobileMenu();
            }}
            className={\`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all \${
              isActive 
                 ? 'bg-gradient-to-r from-purple-600 via-rose-500 to-orange-500 text-white font-semibold shadow-lg' 
                 : 'text-gray-400 hover:text-white hover:bg-white/5'
            }\`}
          >
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5" />
              <span className="text-sm">{item.label}</span>
            </div>
            {item.badge && (
              <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-md font-bold">
                {item.badge}
              </span>
            )}
          </button>
        )
        })}`
);

sidebar = sidebar.replace(
  /\{subNav\.map\(\(item, idx\) => \([\s\S]*?<\/button>\s*\)\)\}/m,
  `{subNav.map((item, idx) => {
          const isActive = activeView === item.id;
          return (
          <button
            key={idx}
            onClick={() => {
              setActiveView(item.id);
              if (onCloseMobileMenu) onCloseMobileMenu();
            }}
            className={\`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all \${
              isActive 
                 ? 'bg-gradient-to-r from-purple-600 via-rose-500 to-orange-500 text-white font-semibold shadow-lg' 
                 : 'text-gray-400 hover:text-white hover:bg-white/5'
            }\`}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm">{item.label}</span>
          </button>
        )
        })}`
);

fs.writeFileSync('src/components/Sidebar.tsx', sidebar);
