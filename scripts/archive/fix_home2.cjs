const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

homeContent = homeContent.replace(
  /<span className="text-xs lg:text-sm font-medium text-gray-300 group-hover:text-white transition-colors">\{cat\.name\}<\/span>\n\s*<\/div>\n\s*<span className="text-sm font-medium text-white shadow-sm">\{cat\.name\}<\/span>\n\s*<\/div>/g,
  '<span className="text-xs lg:text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{cat.name}</span>\n               </div>'
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
