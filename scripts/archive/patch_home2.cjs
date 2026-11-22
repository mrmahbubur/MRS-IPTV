const fs = require('fs');
let content = fs.readFileSync('src/components/Home.tsx', 'utf8');

// Replace all instances of `shrink-0 w-36 sm:w-40 md:w-44 lg:w-48 ` with empty string to revert to w-full
content = content.replace(/shrink-0 w-36 sm:w-40 md:w-44 lg:w-48 /g, 'w-full ');

// But for the flex rows, we need `w-[150px] shrink-0` or similar.
// Since `w-full` would take 100% of flex container if no flex-basis is set... wait, in flex container, w-full means 100% of the parent width.
// We need to add `w-[140px] md:w-[160px] shrink-0` to the cards in the flex containers.

// Let's use a regex to find the flex containers and replace the inner class.
const flexContainersRegex = /<div className="flex overflow-x-auto pb-4 custom-scrollbar gap-4 snap-x">([\s\S]*?)<\/div>\s*<\/section>/g;

content = content.replace(flexContainersRegex, (match, inner) => {
    return `<div className="flex overflow-x-auto pb-4 custom-scrollbar gap-4 snap-x">${inner.replace(/w-full /g, 'w-[140px] md:w-[160px] shrink-0 ')}</div>\n        </section>`;
});

fs.writeFileSync('src/components/Home.tsx', content);
