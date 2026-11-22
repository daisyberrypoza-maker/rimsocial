const mysql = require('mysql2/promise');

const columns = {
  musicSource: 'VARCHAR(10) NULL',
  audiusTrackId: 'VARCHAR(20) NULL',
  artistName: 'VARCHAR(80) NULL',
  artworkUrl: 'VARCHAR(512) NULL',
  musicOffsetSec: 'FLOAT NOT NULL DEFAULT 0',
  origVolume: 'FLOAT NOT NULL DEFAULT 0.3',
  musicVolume: 'FLOAT NOT NULL DEFAULT 0.8',
  musicMixable: 'TINYINT(1) NOT NULL DEFAULT 0',
};

async function main() {
  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error('Missing database configuration: ' + missing.join(', '));
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASS, connectTimeout: 15000 });
  try {
    const [tables] = await db.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [process.env.DB_NAME, 'posts']);
    if (!tables.length) throw new Error('Required table posts does not exist; migration aborted.');
    for (const [name, definition] of Object.entries(columns)) {
      const [found] = await db.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [process.env.DB_NAME, 'posts', name]);
      if (found.length) { console.log('Migration 042: posts.' + name + ' already exists; skipping.'); continue; }
      await db.query('ALTER TABLE posts ADD COLUMN `' + name + '` ' + definition);
      console.log('Migration 042: added posts.' + name + '.');
    }
    const names = Object.keys(columns);
    const [verified] = await db.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME IN (' + names.map(() => '?').join(',') + ')', [process.env.DB_NAME, 'posts', ...names]);
    const present = new Set(verified.map((row) => row.COLUMN_NAME));
    const absent = names.filter((name) => !present.has(name));
    if (absent.length) throw new Error('Migration 042 verification failed; missing: ' + absent.join(', '));
    console.log('Migration 042 verified: all 8 Audius story music columns exist.');
  } finally { await db.end(); }
}
main().catch((error) => { console.error('Migration 042 failed:', error.message); process.exitCode = 1; });
