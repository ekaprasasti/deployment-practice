import express from 'express';
import { checkConnection, query, closePool } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || 'blue';
let isShuttingDown = false;

app.get('/', (req, res) => {
  res.json({ service: 'poc-deployment-api', version });
});

// Liveness probe
app.get('/healthz', (req, res) => {
  if (isShuttingDown) {
    res.status(503).json({ status: 'shutting_down' });
    return;
  }
  res.json({ status: 'ok', version });
});

// Readiness probe (checks DB)
app.get('/ready', async (req, res) => {
  try {
    const dbOk = await checkConnection();
    if (!dbOk) {
      res.status(503).json({ status: 'not_ready', db: 'error' });
      return;
    }
    res.json({ status: 'ready', db: 'ok', version });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});

app.get('/api/version', async (req, res) => {
  try {
    const dbOk = await checkConnection();
    res.json({ version, db: dbOk ? 'ok' : 'error' });
  } catch (error) {
    res.status(500).json({ version, db: 'error', error: error.message });
  }
});

app.get('/api/db-check', async (req, res) => {
  try {
    const result = await query('SELECT NOW() as now');
    res.json({ ok: true, now: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/time', (req, res) => {
  res.json({ now: new Date().toISOString() });
});

const server = app.listen(port, () => {
  console.log(`API listening on port ${port} (version=${version})`);
});

function shutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;
  server.close(async () => {
    await closePool();
    console.log('HTTP server closed. Exiting.');
    process.exit(0);
  });
  // Failsafe: force exit if not closed in time
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));


