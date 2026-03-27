// ~/teslamate-api/db.js
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'teslamate',
  user: process.env.DB_USER || 'teslamate',
  password: process.env.DB_PASS,
  max: 5,
  connectionTimeoutMillis: 3000,
});

pool.on('error', (err) => {
  console.error('DB pool error:', err.message);
});

export default pool;
