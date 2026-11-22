const fs = require('fs');
let content = fs.readFileSync('src/components/Home.tsx', 'utf8');

// Replace Live Sports Channels grid container
const liveSportsRegex = /<h3 className="text-lg lg:text-xl font-semibold text-white">Live Sports Channels<\/h3>[\s\S]*?<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">/g;

content = content.replace(liveSportsRegex, (match) => {
    return match.replace(
        '<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">',
        '<div className="flex overflow-x-auto pb-4 custom-scrollbar gap-4 snap-x">'
    );
});

// For Recommended For You
const recommendedRegex = /<h3 className="text-lg lg:text-xl font-semibold text-white">Recommended For You<\/h3>[\s\S]*?<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">/g;

content = content.replace(recommendedRegex, (match) => {
    return match.replace(
        '<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">',
        '<div className="flex overflow-x-auto pb-4 custom-scrollbar gap-4 snap-x">'
    );
});

// Now we need to update the card classes in these sections to have a fixed width so they don't shrink.
// Because the generic `ChannelGrid` uses the grid layout, we only want to change the cards in the Live Sports and Recommended sections.
// But it's easier to just add `min-w-[140px] sm:min-w-[160px] md:min-w-[180px] shrink-0 snap-start` to all cards, which doesn't hurt the grid view as much, or we can just replace specifically within those blocks.

// Wait, the generic ChannelGrid also has the `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4` container. Wait, if it does, it's fine.
// But if we add width to all channel cards, it might affect the ChannelGrid if it's using the same classes.
// Actually, in CSS Grid, `w-full` works best.
// The easiest way is to modify the classes of the cards in the flex containers.

content = content.replace(/className="bg-gradient-to-b from-\[#0f111a\] to-\[#0a0b10\] border border-white\/5 rounded-xl p-4 cursor-pointer hover:border-orange-500\/50 transition-all group relative flex flex-col items-center"/g, 'className="shrink-0 w-36 sm:w-40 md:w-44 lg:w-48 bg-gradient-to-b from-[#0f111a] to-[#0a0b10] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-orange-500/50 transition-all group relative flex flex-col items-center snap-start"');

fs.writeFileSync('src/components/Home.tsx', content);
