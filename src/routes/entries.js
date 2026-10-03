// ============================================================
// PILLAR 3 — THE ACTION: CRUD ↔ REST ↔ SQL
//   CREATE = POST   = INSERT      (non-idempotent: repeats create rows)
//   READ   = GET    = SELECT
//   UPDATE = PUT    = UPDATE      (PATCH = partial update)
//   DELETE = DELETE = DELETE
//
// Every statement below uses placeholders (?) — the values are
// bound separately by the driver and can never become SQL code.
// ============================================================

const express = require('express');
const { validateEntry, validateEntryPatch, mapDbError } = require('../middleware/validate');

const router = express.Router();

// Helper: attach tags (M:N via junction table) to a set of entries.
function attachTags(db, entries) {
  if (entries.length === 0) return entries;
  const ids = entries.map((e) => e.entry_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT et.entry_id, t.name
       FROM entry_tags et
       JOIN tags t ON t.tag_id = et.tag_id
      WHERE et.entry_id IN (${placeholders})`
  ).all(...ids);

  const byEntry = new Map();
  for (const r of rows) {
    if (!byEntry.has(r.entry_id)) byEntry.set(r.entry_id, []);
    byEntry.get(r.entry_id).push(r.name);
  }
  return entries.map((e) => ({ ...e, tags: byEntry.get(e.entry_id) || [] }));
}

// ---------- READ (list) ----------
// GET /api/entries  ->  200
router.get('/', (req, res, next) => {
  try {
    const db = req.app.get('db');
    const rows = db.prepare(
      `SELECT e.entry_id, e.user_id, e.title, e.content, e.size_kb,
              e.created_at, e.updated_at, u.name AS owner
         FROM vault_entries e
         JOIN users u ON u.user_id = e.user_id
        ORDER BY e.entry_id`
    ).all();
    res.status(200).json({ success: true, count: rows.length, data: attachTags(db, rows) });
  } catch (err) { next(err); }
});

// ---------- READ (single) ----------
// GET /api/entries/:id  ->  200 | 404
router.get('/:id', (req, res, next) => {
  try {
    const db = req.app.get('db');
    const row = db.prepare(
      `SELECT e.*, u.name AS owner
         FROM vault_entries e
         JOIN users u ON u.user_id = e.user_id
        WHERE e.entry_id = ?`
    ).get(req.params.id);

    if (!row) {
      return res.status(404).json({ success: false, error: `Entry ${req.params.id} not found` });
    }
    res.status(200).json({ success: true, data: attachTags(db, [row])[0] });
  } catch (err) { next(err); }
});

// ---------- CREATE ----------
// POST /api/entries  ->  201 | 400 | 409
router.post('/', validateEntry, (req, res, next) => {
  try {
    const db = req.app.get('db');
    const { user_id, title, content = '', size_kb = 0 } = req.body;

    const info = db.prepare(
      `INSERT INTO vault_entries (user_id, title, content, size_kb)
       VALUES (?, ?, ?, ?)`
    ).run(user_id, title, content, size_kb);

    const created = db.prepare('SELECT * FROM vault_entries WHERE entry_id = ?')
      .get(Number(info.lastInsertRowid));

    res.status(201).json({ success: true, message: 'Entry created', data: created });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// ---------- UPDATE (full) ----------
// PUT /api/entries/:id  ->  200 | 400 | 404 | 409
router.put('/:id', validateEntry, (req, res, next) => {
  try {
    const db = req.app.get('db');
    const { user_id, title, content = '', size_kb = 0 } = req.body;

    const info = db.prepare(
      `UPDATE vault_entries
          SET user_id = ?, title = ?, content = ?, size_kb = ?,
              updated_at = datetime('now')
        WHERE entry_id = ?`
    ).run(user_id, title, content, size_kb, req.params.id);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, error: `Entry ${req.params.id} not found` });
    }
    const updated = db.prepare('SELECT * FROM vault_entries WHERE entry_id = ?').get(req.params.id);
    res.status(200).json({ success: true, message: 'Entry updated', data: updated });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// ---------- UPDATE (partial) ----------
// PATCH /api/entries/:id  ->  200 | 400 | 404 | 409
router.patch('/:id', validateEntryPatch, (req, res, next) => {
  try {
    const db = req.app.get('db');
    const fields = ['user_id', 'title', 'content', 'size_kb'];
    const sets = [];
    const values = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);          // column name is from a fixed allow-list, never user input
        values.push(req.body[f]);
      }
    }
    sets.push("updated_at = datetime('now')");
    values.push(req.params.id);

    const info = db.prepare(
      `UPDATE vault_entries SET ${sets.join(', ')} WHERE entry_id = ?`
    ).run(...values);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, error: `Entry ${req.params.id} not found` });
    }
    const updated = db.prepare('SELECT * FROM vault_entries WHERE entry_id = ?').get(req.params.id);
    res.status(200).json({ success: true, message: 'Entry partially updated', data: updated });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// ---------- DELETE ----------
// DELETE /api/entries/:id  ->  204 | 404
router.delete('/:id', (req, res, next) => {
  try {
    const db = req.app.get('db');
    const info = db.prepare('DELETE FROM vault_entries WHERE entry_id = ?').run(req.params.id);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, error: `Entry ${req.params.id} not found` });
    }
    res.status(204).end();              // 204 = deleted, no body
  } catch (err) { next(err); }
});

module.exports = router;
