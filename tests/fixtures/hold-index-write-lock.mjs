// Test fixture (Task 219): hold the index DB's WRITE lock from a separate
// process for a bounded window, so the parent test can prove a concurrent
// writer WAITS (busy_timeout) instead of throwing SQLITE_BUSY immediately.
// argv: <dbPath> <sentinelPath> <holdMs>
// Writes the sentinel AFTER the lock is held so the parent can synchronize.
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';

const [dbPath, sentinelPath, holdMs] = process.argv.slice(2);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec('BEGIN IMMEDIATE'); // acquire the write lock now, not lazily
writeFileSync(sentinelPath, 'held', 'utf8');
setTimeout(() => {
  db.exec('COMMIT');
  db.close();
}, Number(holdMs));
