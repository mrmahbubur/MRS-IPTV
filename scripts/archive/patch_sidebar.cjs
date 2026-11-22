const fs = require('fs');
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

sidebar = sidebar.replace(
  /export const Sidebar = \(\) => \{/g,
  `interface SidebarProps {\n  isMobileMenuOpen?: boolean;\n  onCloseMobileMenu?: () => void;\n}\n\nexport const Sidebar: React.FC<SidebarProps> = ({ isMobileMenuOpen, onCloseMobileMenu }) => {`
);

sidebar = sidebar.replace(
  /<aside className="hidden lg:flex w-64 flex-col bg-\[\#0b0c10\] border-r border-white\/5 h-screen overflow-y-auto custom-scrollbar sticky top-0 pb-6 shrink-0 z-50">/g,
  `<>\n      {isMobileMenuOpen && (\n        <div \n          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40" \n          onClick={onCloseMobileMenu}\n        />\n      )}\n      <aside className={\`\n        fixed lg:sticky top-0 left-0 h-screen w-64 flex-col bg-[#0b0c10] border-r border-white/5 \n        overflow-y-auto custom-scrollbar pb-6 shrink-0 z-50 transition-transform duration-300\n        \${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}\n      \`}>\n        {isMobileMenuOpen && (\n          <button \n            className="lg:hidden absolute top-4 right-4 text-gray-400 hover:text-white"\n            onClick={onCloseMobileMenu}\n          >\n            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>\n          </button>\n        )}`
);

sidebar = sidebar.replace(
  /<\/aside>/g,
  `</aside>\n    </>`
);

fs.writeFileSync('src/components/Sidebar.tsx', sidebar);
