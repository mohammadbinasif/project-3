// ============================================================
// PILLAR 4 DEMO — SQL INJECTION: vulnerable vs secure
// Run: npm run demo:injection
//
// Same input, two coding styles:
//   VULNERABLE : input pasted into SQL text  -> input becomes CODE
//   SECURE     : input bound as a parameter   -> input stays DATA
//
// This script only READS. Nothing is damaged. Educational proof.
// ============================================================

const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  );
`);
db.prepare('INSERT INTO users VALUES (1, ?, ?, ?)').run('alice@vault.dev', 's3cret', 'user');
db.prepare('INSERT INTO users VALUES (2, ?, ?, ?)').run('admin@vault.dev', 'hunter2', 'admin');

const ATTACK = "' OR 1=1 --"; // classic payload: closes quote, forces TRUE, comments out the rest

console.log('=== 1) VULNERABLE: string concatenation ===');
const vulnerableSql =
  `SELECT id, email, role FROM users WHERE email = '${ATTACK}' AND password = 'x'`;
console.log('SQL that actually ran:\n  ' + vulnerableSql + '\n');
const leaked = db.prepare(vulnerableSql).all();
console.log(`Rows returned: ${leaked.length}  <- LOGIN BYPASSED, admin row exposed!`);
console.log(JSON.stringify(leaked, null, 2));

console.log('\n=== 2) SECURE: parameterized query ===');
const secureSql = 'SELECT id, email, role FROM users WHERE email = ? AND password = ?';
console.log('SQL that actually ran:\n  ' + secureSql);
console.log('Bound values (Postgres-style $1/$2 shown in README):', JSON.stringify([ATTACK, 'x']));
const safe = db.prepare(secureSql).all(ATTACK, 'x');
console.log(`Rows returned: ${safe.length}  <- payload treated as a literal email string`);
console.log(JSON.stringify(safe, null, 2));

console.log('\n=== 3) BONUS: DROP TABLE attempt ===');
const dropPayload = "'; DROP TABLE users; --";
try {
  db.prepare(`SELECT * FROM users WHERE email = '${dropPayload}'`).all();
} catch (err) {
  console.log('Concatenated version hit an error:', err.message);
}
const stillThere = db.prepare("SELECT COUNT(*) AS n FROM users").get();
console.log(`users table still has ${stillThere.n} rows? ` +
  '(In a real attack the table would be gone — here the query errored before running DROP.)');

console.log('\n=== 4) Same DROP payload through a parameter ===');
db.prepare('SELECT * FROM users WHERE email = ?').all(dropPayload);
console.log('Query succeeded, 0 rows. Table intact:',
  db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 'rows.');

console.log(`
WHY: the driver sends the SQL template and the values SEPARATELY.
  Template : SELECT ... WHERE email = ?     (code, fixed at prepare time)
  Value    : "' OR 1=1 --"                  (data, never parsed as SQL)
The database engine can only substitute the value where a value
belongs — it can never change the structure of the query.`);
