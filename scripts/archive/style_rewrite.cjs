const fs = require('fs');

function processFile(filename) {
    let content = fs.readFileSync(filename, 'utf8');
    
    // Cards and main structures
    content = content.replace(/bg-emerald-950/g, 'bg-white');
    content = content.replace(/bg-emerald-900\/60/g, 'bg-gray-50');
    content = content.replace(/bg-emerald-900\/20/g, 'bg-gray-50');
    content = content.replace(/bg-emerald-900\/30/g, 'bg-gray-100');
    content = content.replace(/bg-emerald-900\/40/g, 'bg-gray-100');
    content = content.replace(/bg-emerald-900\/80/g, 'bg-gray-100');
    content = content.replace(/bg-emerald-900/g, 'bg-gray-100');
    
    // Borders
    content = content.replace(/border-emerald-800\/60/g, 'border-gray-200');
    content = content.replace(/border-emerald-800\/80/g, 'border-gray-200');
    content = content.replace(/border-emerald-800/g, 'border-gray-200');
    content = content.replace(/border-emerald-900/g, 'border-gray-100');
    
    // Text colors on cards
    // Only replace specific instances to avoid breaking main title if it uses text-white
    content = content.replace(/text-emerald-200/g, 'text-gray-900');
    content = content.replace(/text-emerald-300/g, 'text-gray-700');
    content = content.replace(/text-emerald-400/g, 'text-gray-500');
    content = content.replace(/text-emerald-500/g, 'text-gray-400');
    content = content.replace(/text-emerald-600/g, 'text-gray-300');
    
    // Fix text-white inside cards (we need to be careful)
    // "text-white" -> "text-gray-900" for text inside the cards
    // E.g. <h2 className="text-sm md:text-base font-extrabold text-white
    content = content.replace(/text-white tracking-wide/g, 'text-gray-900 tracking-wide');
    content = content.replace(/text-white truncate/g, 'text-gray-900 truncate');
    content = content.replace(/hover:text-white/g, 'hover:text-gray-900');

    // Header bg (it's sticky top-0, should be translucent white or green)
    content = content.replace(/bg-white\/80 backdrop-blur-md/g, 'bg-white/10 backdrop-blur-md');
    
    fs.writeFileSync(filename, content);
}

processFile('src/App.tsx');
processFile('src/components/AndroidEmulator.tsx');
processFile('src/components/EmbedCodeViewer.tsx');
processFile('src/components/VideoPlayer.tsx');

