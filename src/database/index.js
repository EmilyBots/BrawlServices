// src/database/index.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Railway PostgreSQL
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB client error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
