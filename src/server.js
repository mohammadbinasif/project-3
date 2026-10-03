// Entry point: connect FIRST (fail fast), then serve.
const { connect, close } = require('./db/connection');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

let db;
try {
  db = connect();
} catch (err) {
  // PILLAR 2: connection errors are caught, explained, and fatal at boot.
  console.error(`\n[boot] ${err.message}\n`);
  process.exit(1);
}

const app = createApp(db);

const server = app.listen(PORT, () => {
  console.log(`\nDigital Vault API running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET    http://localhost:${PORT}/health`);
  console.log(`  GET    http://localhost:${PORT}/api/users`);
  console.log(`  GET    http://localhost:${PORT}/api/entries`);
  console.log(`  POST   http://localhost:${PORT}/api/entries`);
  console.log(`  PUT    http://localhost:${PORT}/api/entries/1`);
  console.log(`  PATCH  http://localhost:${PORT}/api/entries/1`);
  console.log(`  DELETE http://localhost:${PORT}/api/entries/1\n`);
});

// Graceful shutdown: close the DB so WAL/journal files are flushed.
function shutdown() {
  console.log('\nShutting down...');
  server.close(() => {
    close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
