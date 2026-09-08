import { applySchema } from './index.js';
import { seed } from './seed.js';

applySchema();
const counts = seed();
console.log('SLS Data Center — database reset and seeded:');
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(24)} ${v}`);
console.log('\nAll person-level rows are synthetic demo data. Headline totals match the program brief.');
