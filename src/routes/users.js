// Users + Profiles routes — demonstrates the 1:1 and 1:N relationships
// from Pillar 1 in real queries.
//
//   GET    /api/users          -> list users with their profile (LEFT JOIN)
//   GET    /api/users/:id      -> one user + profile + entries
//   POST   /api/users          -> create user (+ profile in ONE transaction)
//   DELETE /api/users/:id      -> cascade deletes profile, entries, tag links

const express = require('express');
const { validateUser, mapDbError } = require('../middleware/validate');

const router = express.Router();

// READ all — LEFT JOIN keeps users who have no profile yet.
router.get('/', (req, res, next) => {
  try {
    const db = req.app.get('db');
    const rows = db.prepare(
      `SELECT u.user_id, u.name, u.email, u.age, u.created_at,
              p.bio, p.avatar_url
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.user_id
        ORDER BY u.user_id`
    ).all();
    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
});

// READ one — user + profile (1:1) + their entries (1:N) in one response.
router.get('/:id', (req, res, next) => {
  try {
    const db = req.app.get('db');
    const user = db.prepare(
      `SELECT u.user_id, u.name, u.email, u.age, u.created_at,
              p.bio, p.avatar_url
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.user_id
        WHERE u.user_id = ?`
    ).get(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: `User ${req.params.id} not found` });
    }
    const entries = db.prepare(
      'SELECT entry_id, title, size_kb, created_at FROM vault_entries WHERE user_id = ? ORDER BY entry_id'
    ).all(req.params.id);

    res.status(200).json({ success: true, data: { ...user, entries } });
  } catch (err) { next(err); }
});

// CREATE — user + optional profile written atomically.
// If ANY insert fails, the transaction rolls back: no half-created users.
router.post('/', validateUser, (req, res, next) => {
  try {
    const db = req.app.get('db');
    const { name, email, age, bio = null, avatar_url = null } = req.body;

    let userId;
    db.exec('BEGIN');
    try {
      const info = db.prepare(
        'INSERT INTO users (name, email, age) VALUES (?, ?, ?)'
      ).run(name, email, age);
      userId = Number(info.lastInsertRowid);

      db.prepare(
        'INSERT INTO profiles (user_id, bio, avatar_url) VALUES (?, ?, ?)'
      ).run(userId, bio, avatar_url);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const created = db.prepare(
      `SELECT u.*, p.bio, p.avatar_url
         FROM users u JOIN profiles p ON p.user_id = u.user_id
        WHERE u.user_id = ?`
    ).get(userId);

    res.status(201).json({ success: true, message: 'User created', data: created });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// DELETE — ON DELETE CASCADE in the schema removes profile + entries +
// junction rows. The app does NOT loop over children; the schema does.
router.delete('/:id', (req, res, next) => {
  try {
    const db = req.app.get('db');
    const info = db.prepare('DELETE FROM users WHERE user_id = ?').run(req.params.id);
    if (info.changes === 0) {
      return res.status(404).json({ success: false, error: `User ${req.params.id} not found` });
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
