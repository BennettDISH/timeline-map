const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  // pg-pool has already dropped the dead client; the next query reconnects. Exiting here
  // took the whole server — every player's phone included — down on each Postgres restart.
  console.error('Postgres idle client error (recovered):', err.message);
});

// A checked-out client has NO error listener while it is out of the pool, so a connection
// dropped mid-transaction becomes an unhandled 'error' event and kills the process.
// connectTx() attaches one, and its release() discards the client when it broke.
pool.connectTx = async () => {
  const client = await pool.connect();
  let broken = null;
  const onErr = (e) => { broken = e; console.error('Postgres client error (transaction):', e.message); };
  client.on('error', onErr);
  const release = client.release;
  client.release = (err) => { client.removeListener('error', onErr); release.call(client, err || broken || undefined); };
  return client;
};

module.exports = pool;