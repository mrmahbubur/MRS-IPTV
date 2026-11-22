const fs = require('fs');
let homeContent = fs.readFileSync('src/components/Home.tsx', 'utf8');

homeContent = homeContent.replace(
  /export const Home: React\.FC<HomeProps> = \(\{ channels, onSelectChannel \}\) => \{/g,
  `export const Home: React.FC<HomeProps> = ({ channels, onSelectChannel }) => {\n  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);`
);

fs.writeFileSync('src/components/Home.tsx', homeContent);
