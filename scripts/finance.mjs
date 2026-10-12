#!/usr/bin/env node
// Aprista (sec) — catatan keuangan pribadi Owner di Google Sheet (lewat Apps Script web app, finance/apps-script.gs).
// Data cuma di sheet: nggak masuk DB, panel chat, maupun web kantor. Angka dihitung script ini, bukan dikira-kira AI.
//   node scripts/finance.mjs add '[{"tanggal":"2026-10-12","tipe":"keluar","nominal":25000,"kategori":"Makan","ket":"nasi padang","akun":"Cash"}]'
//   node scripts/finance.mjs list [dari] [sampai] [kata]   → baris transaksi (maks 60 terbaru)
//   node scripts/finance.mjs sum [dari] [sampai]           → total masuk/keluar, per kategori, saldo per akun (semua waktu)
//   node scripts/finance.mjs del <id> [id…]
//   node scripts/finance.mjs edit <id> '{"nominal":30000}'
// tipe: masuk | keluar | pindah (antar akun: akun → ke_akun). Tanggal yyyy-mm-dd (WITA).
process.removeAllListeners('warning');
import { loadEnv } from './approval.mjs';

const TIPE = ['masuk', 'keluar', 'pindah'];
const rp = (n) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());

export async function sheet(action, body = {}) {
  const env = loadEnv();
  if (!env.FINANCE_SHEET_URL || !env.FINANCE_SHEET_TOKEN) throw new Error('Google Sheet belum disambungin (FINANCE_SHEET_URL / FINANCE_SHEET_TOKEN di .env VPS kosong)');
  const r = await fetch(env.FINANCE_SHEET_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: env.FINANCE_SHEET_TOKEN, action, ...body }), redirect: 'follow' });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error(`balasan sheet aneh (HTTP ${r.status})`); }
  if (!j.ok) throw new Error(`sheet: ${j.error}`);
  return j;
}

const asRow = (r) => ({ id: r[0], tanggal: String(r[1]).slice(0, 10), tipe: r[2], nominal: Number(r[3]) || 0, kategori: r[4], ket: r[5], akun: r[6] || 'Cash', ke_akun: r[7] });
async function rows() { return (await sheet('list')).rows.map(asRow).filter((r) => TIPE.includes(r.tipe)); }
const inRange = (dari, sampai) => (r) => (!dari || r.tanggal >= dari) && (!sampai || r.tanggal <= sampai);

function clean(x) {
  const n = Math.round(Number(String(x.nominal).replace(/[^\d.-]/g, '')));
  if (!TIPE.includes(x.tipe)) throw new Error(`tipe harus ${TIPE.join('/')}: ${JSON.stringify(x)}`);
  if (!(n > 0)) throw new Error(`nominal harus angka > 0: ${JSON.stringify(x)}`);
  if (x.tipe === 'pindah' && !x.ke_akun) throw new Error('tipe pindah butuh ke_akun');
  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal ?? '') ? x.tanggal : today();
  return { tanggal, tipe: x.tipe, nominal: n, kategori: x.kategori || 'Lainnya', ket: x.ket || '', akun: x.akun || 'Cash', ke_akun: x.ke_akun || '' };
}

export async function summary(dari, sampai) {
  const all = await rows();
  const saldo = {};
  for (const r of all) {
    if (r.tipe === 'masuk') saldo[r.akun] = (saldo[r.akun] ?? 0) + r.nominal;
    if (r.tipe === 'keluar') saldo[r.akun] = (saldo[r.akun] ?? 0) - r.nominal;
    if (r.tipe === 'pindah') { saldo[r.akun] = (saldo[r.akun] ?? 0) - r.nominal; saldo[r.ke_akun] = (saldo[r.ke_akun] ?? 0) + r.nominal; }
  }
  const sel = all.filter(inRange(dari, sampai));
  const tot = (t) => sel.filter((r) => r.tipe === t).reduce((s, r) => s + r.nominal, 0);
  const kat = {};
  for (const r of sel.filter((x) => x.tipe === 'keluar')) kat[r.kategori] = (kat[r.kategori] ?? 0) + r.nominal;
  const masuk = tot('masuk'), keluar = tot('keluar');
  return [
    `Periode: ${dari || 'awal'} s/d ${sampai || 'sekarang'} (${sel.length} transaksi)`,
    `Masuk ${rp(masuk)} · Keluar ${rp(keluar)} · Selisih ${rp(masuk - keluar)}`,
    `Keluar per kategori: ${Object.entries(kat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${rp(v)}`).join(', ') || '-'}`,
    `Saldo per akun (semua waktu): ${Object.entries(saldo).map(([k, v]) => `${k} ${rp(v)}`).join(', ') || '-'} · Total ${rp(Object.values(saldo).reduce((s, v) => s + v, 0))}`,
  ].join('\n');
}

const fmt = (r) => `#${r.id} ${r.tanggal} ${r.tipe} ${rp(r.nominal)} [${r.kategori}] ${r.ket} (${r.akun}${r.ke_akun ? `→${r.ke_akun}` : ''})`;

if (process.argv[1]?.endsWith('finance.mjs')) {
  const [cmd, ...a] = process.argv.slice(2);
  try {
    if (cmd === 'add') {
      const list = [].concat(JSON.parse(a[0])).map(clean);
      const { ids } = await sheet('add', { rows: list });
      console.log(list.map((r, i) => fmt({ ...r, id: ids[i] })).join('\n'));
    } else if (cmd === 'list') {
      const [dari, sampai, q] = a;
      const sel = (await rows()).filter(inRange(dari, sampai)).filter((r) => !q || `${r.kategori} ${r.ket} ${r.akun}`.toLowerCase().includes(q.toLowerCase()));
      console.log(sel.slice(-60).map(fmt).join('\n') || '(kosong)');
    } else if (cmd === 'sum') {
      console.log(await summary(a[0], a[1]));
    } else if (cmd === 'del') {
      console.log(`dihapus: ${(await sheet('del', { ids: a.map(Number) })).ids.join(', ') || '(tidak ada)'}`);
    } else if (cmd === 'edit') {
      const set = JSON.parse(a[1]);
      if (set.tipe && !TIPE.includes(set.tipe)) throw new Error('tipe salah');
      console.log(`diubah: #${(await sheet('edit', { id: Number(a[0]), set })).id}`);
    } else {
      console.log('pakai: add | list | sum | del | edit (lihat header file)');
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    process.exitCode = 1;
  }
}
