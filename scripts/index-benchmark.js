// ============================================================
// EXTRA EXPERIMENT — Query optimization with an index
// Run: npm run demo:index
//
// Seeds 50,000 rows, then measures the same SELECT with and
// without an index, and shows EXPLAIN QUERY PLAN before/after.
// ============================================================

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE vault_entries (
    entry_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    size_kb INTEGER NOT NULL DEFAULT 0
  );
`);

const N = 50000;
const insert = db.prepare('INSERT INTO vault_entries (user_id, title, size_kb) VALUES (?, ?, ?)');
db.exec('BEGIN');
for (let i = 1; i <= N; i++) {
  insert.run(i % 500, `Document ${i}`, i % 1024);
}
db.exec('COMMIT');
console.log(`Seeded ${N} rows.`);

const QUERY = 'SELECT * FROM vault_entries WHERE user_id = ?';
const TARGET = 42;

function timeQuery(label, rounds = 2000) {
  // Warm-up
  for (let i = 0; i < 100; i++) db.prepare(QUERY).all(TARGET);
  const start = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) db.prepare(QUERY).all(TARGET);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${QUERY}`).all(TARGET)
    .map((r) => r.detail).join(' | ');
  console.log(`\n${label}`);
  console.log(`  plan : ${plan}`);
  console.log(`  time : ${ms.toFixed(1)} ms for ${rounds} runs (${(ms / rounds).toFixed(4)} ms/query)`);
  return ms;
}

const without = timeQuery('WITHOUT index (full table scan)');

db.exec('CREATE INDEX idx_entries_user ON vault_entries (user_id)');
const withIdx = timeQuery('WITH index (idx_entries_user)');

console.log(`\nSpeedup: ${(without / withIdx).toFixed(1)}x faster`);
console.log('Trade-off: the index makes reads faster but costs a little extra');
console.log('storage and slows INSERT/UPDATE slightly (SQLite must maintain it).');
console.log('Rule of thumb: index columns you filter or join on frequently.');
