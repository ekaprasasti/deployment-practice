import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'appdb',
  max: 5,
  idleTimeoutMillis: 10000,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function checkConnection() {
  const result = await pool.query('SELECT 1 as ok');
  return result.rows[0].ok === 1;
}

export default pool;


