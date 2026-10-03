// ============================================================
// PROJECT 3 · PILLAR 2 — THE BRIDGE (Integration & Connection)
//
// Driver choice: node:sqlite (Node's built-in native driver).
//   - Raw SQL, zero dependencies, no binary to download
//   - Synchronous API: simple to reason about in examples
//   - Same SQL skills transfer 1:1 to PostgreSQL/MySQL later
//
// This module OWNS the "Database Connection Error" case:
// every failure is caught, explained in plain English, and
// re-thrown so the caller decides what to do (exit vs 503).
// ============================================================

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'vault.db');

let db = null;

/**
 * Open (or return the already-open) database connection.
 * @param {string} [dbPath] - file path, or ':memory:' for tests
 * @returns {import('node:sqlite').DatabaseSync}
 * @throws {Error} with a clear, human-readable message
 */
function connect(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (db) return db;

  try {
    // Make sure the folder exists for file-backed databases
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    db = new DatabaseSync(dbPath);

    // SQLite ships with foreign keys OFF by default (unlike Postgres).
    // Turn them on so our ON DELETE CASCADE / REFERENCES rules actually run.
    db.exec('PRAGMA foreign_keys = ON');

    console.log(`[db] Connected: ${dbPath}`);
    return db;
  } catch (err) {
    // Never swallow the error — translate it, then re-throw.
    const message = describeConnectionError(err, dbPath);
    const wrapped = new Error(message);
    wrapped.cause = err;
    throw wrapped;
  }
}

/**
 * Turn cryptic driver errors into instructions a human can act on.
 */
function describeConnectionError(err, dbPath) {
  const raw = String(err.message || err);
  const code = err.code || (err.cause && err.cause.code) || '';

  // Failures while creating the parent folder (our own mkdir step)
  if (code === 'ENOTDIR' || /ENOTDIR/i.test(raw)) {
    return `Invalid database path "${dbPath}": a part of it is a file, not a folder. ` +
      `Pick a path whose parent directories all exist as folders.`;
  }
  if (code === 'ENOENT' || /ENOENT/i.test(raw)) {
    return `Invalid database path "${dbPath}": the drive or folder does not exist. ` +
      `Check the path and try again.`;
  }
  if (code === 'EACCES' || code === 'EPERM' || /EACCES|EPERM/i.test(raw)) {
    return `Permission denied writing to "${dbPath}". ` +
      `Choose a folder your user account can write to.`;
  }
  if (/unable to open database file/i.test(raw)) {
    return `Cannot open the database file at "${dbPath}". ` +
      `Check that the path is writable and the folder exists.`;
  }
  if (/database is locked|SQLITE_BUSY/i.test(raw)) {
    return `Database "${dbPath}" is locked by another process. ` +
      `Close other servers/scripts using it and retry.`;
  }
  if (/file is not a database|not a valid database/i.test(raw)) {
    return `File "${dbPath}" exists but is not a valid SQLite database. ` +
      `It may be corrupted — delete it and run "npm run db:migrate" to rebuild.`;
  }
  return `Database connection failed: ${raw}`;
}

/** Cheap liveness probe used by GET /health and startup checks. */
function ping() {
  if (!db) throw new Error('Database is not connected.');
  const row = db.prepare('SELECT 1 AS ok').get();
  return row.ok === 1;
}

/** Close the connection (graceful shutdown / tests). */
function close() {
  if (db) {
    db.close();
    db = null;
    console.log('[db] Connection closed');
  }
}

module.exports = { connect, ping, close, getDb: () => db };
