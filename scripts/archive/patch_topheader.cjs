const fs = require('fs');
let content = fs.readFileSync('src/components/TopHeader.tsx', 'utf8');

// Remove bell and profile buttons
content = content.replace(
  /<div className="relative">\s*<button className="text-white relative hover:text-orange-400 transition-colors">\s*<Bell className="w-6 h-6" \/>\s*<span className="absolute top-0 right-0 w-2\.5 h-2\.5 bg-red-500 rounded-full border-2 border-\[\#0b0c10\]"><\/span>\s*<\/button>\s*<\/div>\s*<button className="w-9 h-9 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center border-2 border-\[\#0b0c10\] ring-2 ring-white\/10 hover:ring-orange-500 transition-all">\s*<User className="w-5 h-5 text-white" \/>\s*<\/button>/g,
  ''
);

// We need to just string replace in case the regex doesn't match perfectly
fs.writeFileSync('src/components/TopHeader.tsx', content);
