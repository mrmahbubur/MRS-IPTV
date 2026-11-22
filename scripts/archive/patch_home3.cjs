const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

homeContent = homeContent.replace(
  /className="bg-transparent border border-white\/10 rounded-2xl p-4 lg:p-6 flex flex-col lg:flex-row items-center justify-center gap-3 lg:gap-4 text-center lg:text-left hover:border-white\/20 hover:bg-white\/5 transition-colors"/g,
  'className="bg-transparent border border-white/10 rounded-2xl p-3 lg:p-4 flex flex-row items-center justify-start gap-3 hover:border-white/20 hover:bg-white/5 transition-colors"'
);
homeContent = homeContent.replace(
  /className=\{\`w-12 h-12 shrink-0 rounded-xl bg-transparent border border-white\/10 \$\{feat\.color\.replace\("text-", "text-"\)\} flex items-center justify-center mb-2 lg:mb-0\`\}/g,
  'className={`w-12 h-12 shrink-0 rounded-xl bg-transparent border border-white/10 ${feat.color} flex items-center justify-center`}'
);
homeContent = homeContent.replace(
  /className="grid grid-cols-2 md:grid-cols-4 gap-4"/g,
  'className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4"'
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
