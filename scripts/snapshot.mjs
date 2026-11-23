// Daily snapshot: runs every dashboard query on Metabase and saves the answers in data/.
// Needs METABASE_API_KEY (a Metabase API key with access to database 113). Run: node scripts/snapshot.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const BASE = process.env.METABASE_URL || 'https://metabase.wiom.in';
const KEY = process.env.METABASE_API_KEY;
if (!KEY) { console.error('METABASE_API_KEY is not set'); process.exit(1); }

const queries = JSON.parse(readFileSync('queries.json', 'utf8'));
const cfg = JSON.parse(readFileSync('params.json', 'utf8'));
const daysAgo = (n) => new Date(Date.now() + 5.5 * 3600000 - n * 86400000).toISOString().slice(0, 10);

// Every value each filter can take in the snapshot: the saved default plus the page's quick buttons.
const choices = {};
for (const [k, v] of Object.entries(cfg.defaults)) choices[k] = [v];
for (const [k, list] of Object.entries(cfg.variants || {})) {
  choices[k] = [...new Set([cfg.defaults[k], ...list.map((x) => (typeof x === 'object' && x.daysAgo != null ? daysAgo(x.daysAgo) : x))])];
}
const combos = (names) => names.reduce((acc, n) => acc.flatMap((c) => choices[n].map((v) => ({ ...c, [n]: v }))), [{}]);

const run = async (sql) => {
  const r = await fetch(`${BASE}/api/dataset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ database: 113, type: 'native', native: { query: sql }, constraints: { 'max-results': 100000, 'max-results-bare-rows': 100000 } }),
  });
  const j = await r.json();
  if (!r.ok || j.error || (j.status && j.status !== 'completed')) throw new Error(String(j.error || j.message || r.status).slice(0, 300));
  // Keep only what the page reads: column names and rows. Nothing else from Metabase is published.
  return { status: 'completed', data: { cols: j.data.cols.map((c) => ({ name: c.name })), rows: j.data.rows, rows_truncated: !!j.data.rows_truncated } };
};

mkdirSync('data', { recursive: true });
const files = {};
let failed = 0;
for (const [id, q] of Object.entries(queries)) {
  for (const c of combos(q.params)) {
    let sql = q.sql;
    for (const [n, v] of Object.entries(c)) {
      if (q.rules[n] && !new RegExp(q.rules[n]).test(v)) throw new Error(`${id}: ${n}=${v} breaks its rule`);
      sql = sql.split(`{{${n}}}`).join(v);
    }
    const key = id + '|' + q.params.map((n) => `${n}=${c[n]}`).join('|');
    const file = `${id}-${createHash('sha1').update(key).digest('hex').slice(0, 10)}.json`;
    const t0 = Date.now();
    try {
      const ans = await run(sql);
      writeFileSync(`data/${file}`, JSON.stringify(ans));
      files[key] = file;
      console.log(`ok   ${key}  ${ans.data.rows.length} rows  ${((Date.now() - t0) / 1000).toFixed(1)}s${ans.data.rows_truncated ? '  TRUNCATED' : ''}`);
    } catch (e) { failed += 1; console.error(`FAIL ${key}: ${e.message}`); }
  }
}
writeFileSync('data/manifest.json', JSON.stringify({ generated_at: new Date().toISOString(), files }, null, 1));
if (failed) { console.error(`${failed} queries failed`); process.exit(1); }
