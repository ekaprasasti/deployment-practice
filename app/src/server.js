import express from 'express';
import { checkConnection, query } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || 'blue';

app.get('/', (req, res) => {
  res.json({ service: 'poc-deployment-api', version });
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

app.listen(port, () => {
  console.log(`API listening on port ${port} (version=${version})`);
});


