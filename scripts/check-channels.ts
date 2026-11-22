// Usage: npm run check-channels -- [playlist.m3u ...] (no args uses configured sources & data/*.m3u)
import 'dotenv/config';
import { loadSources, syncSources, runChecks, stats, liveChannels } from '../server/livecheck/pipeline.js';

(async () => {
  const args = process.argv.slice(2);
  const sources = args.length ? args.map((u) => ({ url: u, name: u })) : loadSources();
  console.log('sync', await syncSources(sources));
  let t: { checked: number; live: number; dead: number };
  do {
    t = await runChecks({ limit: 2000 });
    console.log('checked', t);
  } while (t.checked > 0);
  console.log(JSON.stringify(stats(), null, 2));
  console.log('live channels:', liveChannels({}).length);
})().catch((err) => {
  console.error('[check-channels] error:', err?.message || err);
  process.exit(1);
});
