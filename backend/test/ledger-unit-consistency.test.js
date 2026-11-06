const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('gift ledger keeps coin counts separate from fiat minor units', () => {
  const wallet = fs.readFileSync(path.join(root, 'src/services/wallet.js'), 'utf8');
  assert.match(wallet, /kind: 'gift_out', deltaMinor: 0, deltaCoins: -coins/);
  assert.match(wallet, /kind: 'gift_in', deltaMinor: creatorMinor/);
});

test('ledger model declares deltaCoins as an integer coin-movement field', () => {
  const db = fs.readFileSync(path.join(root, 'src/db.js'), 'utf8');
  assert.match(db, /deltaCoins:\s*\{\s*type:\s*DataTypes\.BIGINT,\s*allowNull:\s*false,\s*defaultValue:\s*0\s*\}/);
  assert.match(db, /tableName:\s*'ledger_entries'/);
});

test('ledger migration preserves historical gift-out coin counts and clears fiat field', () => {
  const migration = fs.readFileSync(path.join(root, 'migrations/023-ledger-unit-consistency.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN deltaCoins BIGINT NOT NULL DEFAULT 0/);
  assert.match(migration, /SET deltaCoins = ABS\(deltaMinor\), deltaMinor = 0/);
  assert.match(migration, /WHERE kind = 'gift_out' AND deltaMinor <> 0/);
});
