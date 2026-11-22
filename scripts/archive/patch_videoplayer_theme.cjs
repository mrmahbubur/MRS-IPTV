const fs = require('fs');
let vpContent = fs.readFileSync('src/components/VideoPlayer.tsx', 'utf8');

// Replace the main container class to add the sci-fi gaming overlay border
vpContent = vpContent.replace(
  /className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group"/,
  'className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group border-[3px] border-red-700/80 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.4),inset_0_0_20px_rgba(220,38,38,0.3)] box-border"'
);

// We can add a high tech corner element pseudo-effect or just use an absolute div
vpContent = vpContent.replace(
  /<div className="absolute inset-0 w-full h-full pointer-events-none">/,
  `{/* Cyberpunk Corners */}
      <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-red-500 pointer-events-none z-30 opacity-70"></div>
      <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-red-500 pointer-events-none z-30 opacity-70"></div>
      <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-red-500 pointer-events-none z-30 opacity-70"></div>
      <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-red-500 pointer-events-none z-30 opacity-70"></div>
      <div className="absolute inset-0 w-full h-full pointer-events-none">`
);

// Update progress bar color
vpContent = vpContent.replace(
  /className="h-full bg-white\/50 w-full"/,
  'className="h-full bg-red-600 w-full shadow-[0_0_10px_rgba(220,38,38,0.8)]"'
);

// Top bar UI
vpContent = vpContent.replace(
  /className="p-3 bg-white\/10 hover:bg-white\/20 rounded-full transition-colors backdrop-blur-sm"/g,
  'className="p-3 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 rounded-sm transition-colors backdrop-blur-sm shadow-[0_0_10px_rgba(220,38,38,0.2)]"'
);
vpContent = vpContent.replace(
  /className="text-lg font-medium text-white shadow-sm"/,
  'className="text-lg font-bold text-red-50 shadow-sm uppercase tracking-wider text-shadow-red"'
);

fs.writeFileSync('src/components/VideoPlayer.tsx', vpContent);
