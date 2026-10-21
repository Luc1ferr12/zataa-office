// Satu pintu buka db/office.db. Watcher, trading, bot, CLI sesi harian nulis barengan ke file yang sama:
// busy_timeout WAJIB di-set paling awal (sebelum PRAGMA/ALTER apa pun), kalau nggak langsung "database is locked".
process.removeAllListeners('warning'); // sembunyikan ExperimentalWarning node:sqlite
const { DatabaseSync } = await import('node:sqlite');
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'office.db');
// potongan kode buat `node -e` lewat SSH (laptop-worker, render/shorts-laptop) — aturannya sama
export const DB_SNIPPET = "const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync('db/office.db'); db.exec('PRAGMA busy_timeout = 15000');";

export function openDb(path = DB_PATH) {
  const d = new DatabaseSync(path);
  d.exec('PRAGMA busy_timeout = 15000');
  return d;
}
