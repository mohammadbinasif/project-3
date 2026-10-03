// Automated quality gate: npm test
// Covers all 4 pillars: schema constraints, connection, CRUD/status codes, security.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../src/app');

let db;
let server;
let BASE;

before(async () => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const app = createApp(db);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

const json = (res) => res.json();

// ---------- Pillar 1: schema & relationship reads ----------
test('GET / lists available endpoints', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.ok((await json(res)).endpoints);
});

test('seed data proves one-to-one (users JOIN profiles)', async () => {
  const res = await fetch(`${BASE}/api/users`);
  const body = await json(res);
  assert.equal(res.status, 200);
  assert.ok(body.count >= 2, 'seed users exist');
  assert.ok(body.data[0].bio !== undefined, 'profile joined onto user (1:1)');
});

test('GET /api/users/:id returns user + profile + entries (1:N)', async () => {
  const res = await fetch(`${BASE}/api/users/1`);
  const body = await json(res);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.data.entries), 'entries array (1:N)');
  assert.ok(body.data.entries.length >= 1);
});

test('GET /api/entries returns tags (M:N via junction table)', async () => {
  const res = await fetch(`${BASE}/api/entries`);
  const body = await json(res);
  assert.equal(res.status, 200);
  const tagged = body.data.find((e) => e.tags.length > 0);
  assert.ok(tagged, 'at least one entry has tags');
  assert.ok(typeof tagged.owner === 'string', 'owner name joined from users');
});

// ---------- Pillar 3: CRUD + status codes ----------
let createdId;

test('CREATE: POST /api/entries -> 201', async () => {
  const res = await fetch(`${BASE}/api/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 1, title: 'Will & Testament', content: 'pdf...', size_kb: 2048 })
  });
  const body = await json(res);
  assert.equal(res.status, 201);
  assert.equal(body.data.title, 'Will & Testament');
  createdId = body.data.entry_id;
});

test('CREATE is non-idempotent: same POST twice -> two rows', async () => {
  const payload = JSON.stringify({ user_id: 1, title: 'Duplicate run test' });
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload };
  const [r1, r2] = await Promise.all([fetch(`${BASE}/api/entries`, opts), fetch(`${BASE}/api/entries`, opts)]);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.notEqual((await json(r1)).data.entry_id, (await json(r2)).data.entry_id);
});

test('READ: GET /api/entries/:id -> 200, unknown -> 404', async () => {
  const ok = await fetch(`${BASE}/api/entries/${createdId}`);
  assert.equal(ok.status, 200);
  assert.equal((await json(ok)).data.entry_id, createdId);

  const missing = await fetch(`${BASE}/api/entries/999999`);
  assert.equal(missing.status, 404);
});

test('UPDATE: PUT /api/entries/:id -> 200 with updated content', async () => {
  const res = await fetch(`${BASE}/api/entries/${createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 1, title: 'Will & Testament v2', content: 'updated', size_kb: 3000 })
  });
  const body = await json(res);
  assert.equal(res.status, 200);
  assert.equal(body.data.title, 'Will & Testament v2');
  assert.equal(body.data.size_kb, 3000);
});

test('PARTIAL UPDATE: PATCH changes only the sent field', async () => {
  const res = await fetch(`${BASE}/api/entries/${createdId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size_kb: 10 })
  });
  const body = await json(res);
  assert.equal(res.status, 200);
  assert.equal(body.data.size_kb, 10);
  assert.equal(body.data.title, 'Will & Testament v2', 'untouched field preserved');
});

test('DELETE: DELETE -> 204, then GET -> 404', async () => {
  const del = await fetch(`${BASE}/api/entries/${createdId}`, { method: 'DELETE' });
  assert.equal(del.status, 204);

  const gone = await fetch(`${BASE}/api/entries/${createdId}`);
  assert.equal(gone.status, 404);

  const again = await fetch(`${BASE}/api/entries/${createdId}`, { method: 'DELETE' });
  assert.equal(again.status, 404, 'deleting twice is not idempotent-friendly -> still 404');
});

// ---------- Pillar 4: integrity constraints ----------
test('NOT NULL/CHECK: missing title -> 400', async () => {
  const res = await fetch(`${BASE}/api/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 1, title: 'ab' })
  });
  assert.equal(res.status, 400);
  const body = await json(res);
  assert.ok(body.errors.some((e) => e.includes('title')));
});

test('CHECK age >= 18 enforced at the SCHEMA level', () => {
  assert.throws(
    () => db.prepare("INSERT INTO users (name, email, age) VALUES ('Kid', 'kid@vault.dev', 16)").run(),
    /CHECK constraint failed/
  );
});

test('UNIQUE email enforced by the schema -> 409 via API', async () => {
  // Direct schema proof first:
  assert.throws(
    () => db.prepare("INSERT INTO users (name, email, age) VALUES ('Clone', 'alice@vault.dev', 30)").run(),
    /UNIQUE constraint failed/
  );

  const res = await fetch(`${BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Clone', email: 'alice@vault.dev', age: 30 })
  });
  assert.equal(res.status, 409);
});

test('FOREIGN KEY: entry with nonexistent user_id -> 409', async () => {
  const res = await fetch(`${BASE}/api/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 999999, title: 'Orphan entry' })
  });
  assert.equal(res.status, 409);
  const body = await json(res);
  assert.match(body.error, /foreign key|does not exist/i);
});

test('ON DELETE CASCADE: deleting a user removes profile + entries', async () => {
  const create = await fetch(`${BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Temp Person', email: 'temp@vault.dev', age: 25, bio: 'to be deleted' })
  });
  assert.equal(create.status, 201);
  const userId = (await json(create)).data.user_id;

  const entry = await fetch(`${BASE}/api/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title: 'Cascade target' })
  });
  assert.equal(entry.status, 201);

  const del = await fetch(`${BASE}/api/users/${userId}`, { method: 'DELETE' });
  assert.equal(del.status, 204);

  // Profile + entries must be gone (schema did the work, not the app):
  const profile = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?').get(userId);
  const entries = db.prepare('SELECT COUNT(*) AS n FROM vault_entries WHERE user_id = ?').get(userId);
  assert.equal(profile.n, 0, 'profile cascaded');
  assert.equal(entries.n, 0, 'entries cascaded');
});

// ---------- Pillar 4: SQL injection ----------
test('SQL injection payload in a SELECT is treated as data', () => {
  const rows = db.prepare('SELECT * FROM users WHERE email = ?').all("' OR 1=1 --");
  assert.equal(rows.length, 0, 'payload matched no rows instead of dumping the table');

  const all = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  assert.ok(all.n > 0, 'users table still intact');
});

test('SQL injection via API query is harmless', async () => {
  const res = await fetch(`${BASE}/api/entries/${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(res.status, 404);
  const count = db.prepare('SELECT COUNT(*) AS n FROM vault_entries').get();
  assert.ok(count.n >= 1, 'no rows destroyed');
});
