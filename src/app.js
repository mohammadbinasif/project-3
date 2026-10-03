const express = require('express');
const cors = require('cors');
const { migrate, seedIfEmpty } = require('./db/migrate');

function createApp(db) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Expose the single connection to every route (req.app.get('db'))
  app.set('db', db);

  // Apply schema + seed on boot (idempotent)
  migrate(db);
  seedIfEmpty(db);

  app.get('/', (req, res) => {
    res.json({
      message: 'Digital Vault API — Project 3: Database Integration',
      endpoints: {
        'GET    /health': 'DB liveness check',
        'GET    /api/users': 'List users with profiles',
        'GET    /api/users/:id': 'User + profile + entries',
        'POST   /api/users': 'Create user (with profile, transactional)',
        'DELETE /api/users/:id': 'Delete user (cascades)',
        'GET    /api/entries': 'List vault entries',
        'GET    /api/entries/:id': 'Single entry with tags',
        'POST   /api/entries': 'Create entry',
        'PUT    /api/entries/:id': 'Full update',
        'PATCH  /api/entries/:id': 'Partial update',
        'DELETE /api/entries/:id': 'Delete entry'
      }
    });
  });

  // Health = "is the bridge still standing?"
  app.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.status(200).json({ success: true, database: 'up' });
    } catch (err) {
      res.status(503).json({ success: false, database: 'down', error: err.message });
    }
  });

  app.use('/api/users', require('./routes/users'));
  app.use('/api/entries', require('./routes/entries'));

  // 404
  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found. Visit / for endpoints.' });
  });

  // Central error handler — the last line of defense.
  // DB errors become 500s with a clear message; stack traces stay in logs.
  app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal database error',
      detail: err.message
    });
  });

  return app;
}

module.exports = { createApp };
