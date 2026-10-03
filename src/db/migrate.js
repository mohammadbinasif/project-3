// Runs schema.sql + seed.sql. Idempotent: safe to run repeatedly.
// Usage: npm run db:migrate
// Tests call migrateInMemory() directly instead.

const fs = require('node:fs');
const path = require('node:path');
const { connect, close } = require('./connection');

function migrate(db) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  console.log('[db] Schema applied');
}

function seed(db) {
  const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  db.exec(seedSql);
  console.log('[db] Seed data applied');
}

// Only seed when the table is empty — re-running must not duplicate rows.
function seedIfEmpty(db) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (row.n === 0) seed(db);
}

if (require.main === module) {
  try {
    const db = connect();
    migrate(db);
    seedIfEmpty(db);
    close();
    console.log('[db] Migration complete');
  } catch (err) {
    console.error(`[db] Migration failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { migrate, seed, seedIfEmpty };
