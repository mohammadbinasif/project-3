// ============================================================
// PILLAR 4 — THE SHIELD
// Two layers of defense:
//   1. App-level validation  -> friendly 400s before we touch SQL
//   2. Schema-level CHECKs   -> the real guarantee (never bypassed)
// This file also maps SQLite constraint errors to correct HTTP codes.
// ============================================================

function validateUser(req, res, next) {
  const { name, email, age } = req.body;
  const errors = [];

  if (!name || String(name).trim().length < 2) errors.push('name must be at least 2 characters');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) errors.push('email must be valid');
  if (age === undefined || typeof age !== 'number' || age < 18 || age > 120) {
    errors.push('age must be a number between 18 and 120 (schema CHECK: age >= 18)');
  }

  if (errors.length) return res.status(400).json({ success: false, errors });

  req.body.name = String(name).trim();
  req.body.email = String(email).trim().toLowerCase();
  next();
}

function validateEntry(req, res, next) {
  const { user_id, title, content, size_kb } = req.body;
  const errors = [];

  if (!Number.isInteger(user_id)) errors.push('user_id must be an integer');
  if (!title || String(title).trim().length < 3) errors.push('title must be at least 3 characters');
  if (content !== undefined && typeof content !== 'string') errors.push('content must be a string');
  if (size_kb !== undefined && (!Number.isInteger(size_kb) || size_kb < 0)) {
    errors.push('size_kb must be a non-negative integer (schema CHECK: size_kb >= 0)');
  }

  if (errors.length) return res.status(400).json({ success: false, errors });

  req.body.title = String(title).trim();
  next();
}

// PATCH = partial update: every field optional, but at least one present.
// Only the fields actually sent get validated — that's what "partial" means.
function validateEntryPatch(req, res, next) {
  const allowed = ['title', 'content', 'size_kb', 'user_id'];
  const sent = Object.keys(req.body).filter((k) => allowed.includes(k));
  const errors = [];

  if (sent.length === 0) {
    return res.status(400).json({
      success: false,
      errors: [`provide at least one of: ${allowed.join(', ')}`]
    });
  }

  if (req.body.user_id !== undefined && !Number.isInteger(req.body.user_id)) {
    errors.push('user_id must be an integer');
  }
  if (req.body.title !== undefined && String(req.body.title).trim().length < 3) {
    errors.push('title must be at least 3 characters');
  }
  if (req.body.content !== undefined && typeof req.body.content !== 'string') {
    errors.push('content must be a string');
  }
  if (req.body.size_kb !== undefined && (!Number.isInteger(req.body.size_kb) || req.body.size_kb < 0)) {
    errors.push('size_kb must be a non-negative integer (schema CHECK: size_kb >= 0)');
  }

  if (errors.length) return res.status(400).json({ success: false, errors });

  if (req.body.title !== undefined) req.body.title = String(req.body.title).trim();
  next();
}

// Map SQLite constraint failures (the database refusing bad data)
// onto honest HTTP status codes.
function mapDbError(err) {
  const msg = String(err.message || err);

  if (/UNIQUE constraint failed/i.test(msg)) {
    return { status: 409, error: `Duplicate value: ${msg}` };
  }
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return { status: 409, error: 'Referenced record does not exist (foreign key violation)' };
  }
  if (/NOT NULL constraint failed/i.test(msg) || /CHECK constraint failed/i.test(msg)) {
    return { status: 400, error: `Database rejected the data: ${msg}` };
  }
  if (/no such table/i.test(msg)) {
    return { status: 500, error: 'Schema missing — run "npm run db:migrate"' };
  }
  return null; // not a constraint error -> caller decides (500/503)
}

module.exports = { validateUser, validateEntry, validateEntryPatch, mapDbError };
