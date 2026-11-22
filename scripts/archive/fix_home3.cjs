const fs = require('fs');
let home = fs.readFileSync('src/components/Home.tsx', 'utf8');

home = home.replace(
  /<h4 className="text-xs lg:text-sm font-bold text-white truncate text-center">\{movie\.title\}<\/h4>/g,
  '<h4 className="text-xs lg:text-sm font-bold text-white truncate text-center">{channel.name}</h4>'
);

fs.writeFileSync('src/components/Home.tsx', home);
