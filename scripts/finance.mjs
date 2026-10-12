#!/usr/bin/env node
// Aprista (sec) — catatan keuangan pribadi Owner di Google Sheet (lewat Apps Script web app, finance/apps-script.gs).
// Data cuma di sheet: nggak masuk DB, panel chat, maupun web kantor. Angka dihitung script ini, bukan dikira-kira AI.
// Transaksi (uang masuk/keluar/pindah akun):
//   add '[{"tanggal":"2026-10-12","tipe":"keluar","nominal":25000,"kategori":"Makan & Minum","ket":"nasi padang","akun":"Cash"}]'
//   list [dari] [sampai] [kata] · sum [dari] [sampai] · del <id…> · edit <id> '{"nominal":30000}'
// Tagihan rutin (utang/cicilan/langganan) — dicatat terpisah, BUKAN uang keluar sampai dibayar:
//   bill add '{"nama":"Netflix","jenis":"langganan","nominal":54000,"tgl":15,"akun":"BCA","sisa":"","catatan":""}'
//   bill list · bill pay <id> [nominal] [akun] [tanggal] · bill edit <id> '{"nominal":65000}' · bill del <id>
// Tabungan/investasi (emas, pasar uang, saham, crypto, deposito…) — di luar uang siap pakai:
//   save add '[{"jenis":"emas","aset":"Antam","aksi":"setor|tarik|nilai","unit":"2 gram","nominal":2600000,"akun":"BCA","ket":""}]'
//   save list · save del <id>
// Rekap: morning (rekap pagi + jatah harian) · remind (tagihan H-5 & H-3) · today (yang kecatet hari ini)
process.removeAllListeners('warning');
import { loadEnv } from './approval.mjs';

export const HEADS = {
  Transaksi: ['ID', 'Tanggal', 'Tipe', 'Nominal', 'Kategori', 'Keterangan', 'Akun', 'Ke Akun', 'Dicatat'],
  Tagihan: ['ID', 'Nama', 'Jenis', 'Nominal', 'Jatuh Tempo', 'Akun', 'Sisa Kali', 'Lunas Periode', 'Aktif', 'Catatan', 'Dicatat'],
  Tabungan: ['ID', 'Tanggal', 'Jenis', 'Aset', 'Aksi', 'Unit', 'Nominal', 'Akun', 'Keterangan', 'Dicatat'],
};
const TIPE = ['masuk', 'keluar', 'pindah'];
const SAVE = 'Tabungan'; // akun semu: uang yang dipindah ke tabungan/investasi
export const rp = (n) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1–12
const num = (x) => Math.round(Number(String(x ?? '').replace(/[^\d.-]/g, ''))) || 0;

export async function sheet(action, name = 'Transaksi', body = {}) {
  const env = { ...loadEnv(), ...process.env };
  if (!env.FINANCE_SHEET_URL || !env.FINANCE_SHEET_TOKEN) throw new Error('Google Sheet belum disambungin (FINANCE_SHEET_URL / FINANCE_SHEET_TOKEN di .env VPS kosong)');
  const r = await fetch(env.FINANCE_SHEET_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: env.FINANCE_SHEET_TOKEN, action, sheet: name, head: HEADS[name], ...body }), redirect: 'follow' });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error(`balasan sheet aneh (HTTP ${r.status})`); }
  if (!j.ok) throw new Error(`sheet: ${j.error}`);
  return j;
}
async function table(name) {
  const { head, rows } = await sheet('list', name);
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ---------- transaksi
const asTx = (r) => ({ id: r.ID, tanggal: String(r.Tanggal).slice(0, 10), tipe: r.Tipe, nominal: num(r.Nominal), kategori: r.Kategori, ket: r.Keterangan, akun: r.Akun || 'Cash', ke_akun: r['Ke Akun'] });
const txs = async () => (await table('Transaksi')).map(asTx).filter((r) => TIPE.includes(r.tipe));
const inRange = (dari, sampai) => (r) => (!dari || r.tanggal >= dari) && (!sampai || r.tanggal <= sampai);
function cleanTx(x) {
  const n = num(x.nominal);
  if (!TIPE.includes(x.tipe)) throw new Error(`tipe harus ${TIPE.join('/')}: ${JSON.stringify(x)}`);
  if (!(n > 0)) throw new Error(`nominal harus angka > 0: ${JSON.stringify(x)}`);
  if (x.tipe === 'pindah' && !x.ke_akun) throw new Error('tipe pindah butuh ke_akun');
  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal ?? '') ? x.tanggal : today();
  return { Tanggal: tanggal, Tipe: x.tipe, Nominal: n, Kategori: x.kategori || 'Lainnya', Keterangan: x.ket || '', Akun: x.akun || 'Cash', 'Ke Akun': x.ke_akun || '' };
}
export async function addTx(list) {
  const rows = [].concat(list).map(cleanTx);
  const { ids } = await sheet('add', 'Transaksi', { rows });
  return rows.map((r, i) => fmtTx(asTx({ ...r, ID: ids[i] })));
}
const fmtTx = (r) => `#${r.id} ${r.tanggal} ${r.tipe} ${rp(r.nominal)} [${r.kategori}] ${r.ket} (${r.akun}${r.ke_akun ? `→${r.ke_akun}` : ''})`;

function balances(all) {
  const s = {};
  const mv = (k, v) => { s[k] = (s[k] ?? 0) + v; };
  for (const r of all) {
    if (r.tipe === 'masuk') mv(r.akun, r.nominal);
    if (r.tipe === 'keluar') mv(r.akun, -r.nominal);
    if (r.tipe === 'pindah') { mv(r.akun, -r.nominal); mv(r.ke_akun, r.nominal); }
  }
  delete s[SAVE]; // tabungan dihitung terpisah (sheet Tabungan)
  return s;
}
export async function summary(dari, sampai) {
  const all = await txs();
  const saldo = balances(all);
  const sel = all.filter(inRange(dari, sampai));
  const tot = (t) => sel.filter((r) => r.tipe === t).reduce((s, r) => s + r.nominal, 0);
  const kat = {};
  for (const r of sel.filter((x) => x.tipe === 'keluar')) kat[r.kategori] = (kat[r.kategori] ?? 0) + r.nominal;
  const masuk = tot('masuk'), keluar = tot('keluar');
  return [
    `Periode: ${dari || 'awal'} s/d ${sampai || 'sekarang'} (${sel.length} transaksi)`,
    `Masuk ${rp(masuk)} · Keluar ${rp(keluar)} · Selisih ${rp(masuk - keluar)}`,
    `Keluar per kategori: ${Object.entries(kat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${rp(v)}`).join(', ') || '-'}`,
    `Uang siap pakai per akun (semua waktu, di luar tabungan): ${Object.entries(saldo).map(([k, v]) => `${k} ${rp(v)}`).join(', ') || '-'} · Total ${rp(Object.values(saldo).reduce((s, v) => s + v, 0))}`,
  ].join('\n');
}

// ---------- tagihan rutin
const asBill = (r) => ({ id: r.ID, nama: r.Nama, jenis: r.Jenis, nominal: num(r.Nominal), tgl: num(r['Jatuh Tempo']) || 1, akun: r.Akun, sisa: r['Sisa Kali'] === '' ? '' : num(r['Sisa Kali']), lunas: String(r['Lunas Periode'] || ''), aktif: String(r.Aktif || 'ya') !== 'tidak', catatan: r.Catatan });
const bills = async () => (await table('Tagihan')).map(asBill);
// jatuh tempo berikutnya yang BELUM dibayar (bisa sudah lewat = telat)
export function nextDue(b, from = today()) {
  let [y, m] = from.split('-').map(Number);
  for (let k = 0; k < 24; k++) {
    const period = `${y}-${String(m).padStart(2, '0')}`;
    if (!b.lunas || b.lunas < period) return { period, date: `${period}-${String(Math.min(b.tgl, lastDay(y, m))).padStart(2, '0')}` };
    if (++m > 12) { m = 1; y++; }
  }
  return null;
}
const billKat = (j) => (/utang|hutang|cicil|kredit|paylater|pinjam/i.test(j) ? 'Utang & Cicilan' : /langgan|subs/i.test(j) ? 'Langganan' : 'Tagihan');
const fmtBill = (b, t = today()) => {
  const d = nextDue(b, t);
  const left = d ? diffDays(t, d.date) : null;
  const st = !b.aktif ? 'nonaktif' : left < 0 ? `TELAT ${-left} hari` : left === 0 ? 'jatuh tempo HARI INI' : `${left} hari lagi`;
  return `#${b.id} ${b.nama} (${b.jenis}) ${rp(b.nominal)} tiap tgl ${b.tgl}${b.akun ? ` via ${b.akun}` : ''}${b.sisa !== '' ? ` · sisa ${b.sisa}×` : ''} → ${d?.date ?? '-'} ${st}${b.lunas ? ` · lunas s/d ${b.lunas}` : ''}`;
};
// bayar: catat uang keluar + tandai periode lunas
export async function payBill(id, nominal, akun, tanggal) {
  const b = (await bills()).find((x) => String(x.id) === String(id));
  if (!b) throw new Error(`tagihan #${id} nggak ada`);
  const d = nextDue(b);
  const [tx] = await addTx({ tanggal, tipe: 'keluar', nominal: num(nominal) || b.nominal, kategori: billKat(b.jenis), ket: `Bayar ${b.nama} (${d.period})`, akun: akun || b.akun || 'Cash' });
  const set = { 'Lunas Periode': d.period };
  if (b.sisa !== '') { set['Sisa Kali'] = Math.max(0, b.sisa - 1); if (b.sisa - 1 <= 0) set.Aktif = 'tidak'; }
  await sheet('edit', 'Tagihan', { id: b.id, set });
  return `${tx}\nTagihan #${b.id} ${b.nama} lunas periode ${d.period}${set.Aktif === 'tidak' ? ' (LUNAS SEMUA, dinonaktifkan)' : ''}`;
}

// ---------- tabungan / investasi
const asSave = (r) => ({ id: r.ID, tanggal: String(r.Tanggal).slice(0, 10), jenis: r.Jenis, aset: r.Aset, aksi: r.Aksi, unit: r.Unit, nominal: num(r.Nominal), akun: r.Akun, ket: r.Keterangan });
const saves = async () => (await table('Tabungan')).map(asSave);
export async function addSave(list) {
  const out = [];
  for (const x of [].concat(list)) {
    if (!['setor', 'tarik', 'nilai'].includes(x.aksi)) throw new Error(`aksi harus setor/tarik/nilai: ${JSON.stringify(x)}`);
    const n = num(x.nominal);
    if (!(n > 0)) throw new Error(`nominal harus > 0: ${JSON.stringify(x)}`);
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal ?? '') ? x.tanggal : today();
    const { ids } = await sheet('add', 'Tabungan', { rows: [{ Tanggal: tanggal, Jenis: x.jenis || 'lainnya', Aset: x.aset || x.jenis, Aksi: x.aksi, Unit: x.unit ?? '', Nominal: n, Akun: x.akun || '', Keterangan: x.ket || '' }] });
    out.push(`Tabungan #${ids[0]} ${x.aksi} ${x.aset || x.jenis} ${rp(n)}${x.unit ? ` (${x.unit})` : ''}`);
    // uang dari/ke akun harian ikut dipindah, biar uang siap pakai akurat
    if (x.akun && x.aksi === 'setor') out.push(...await addTx({ tanggal, tipe: 'pindah', nominal: n, kategori: 'Tabungan', ket: `Nabung ${x.aset || x.jenis}`, akun: x.akun, ke_akun: SAVE }));
    if (x.akun && x.aksi === 'tarik') out.push(...await addTx({ tanggal, tipe: 'pindah', nominal: n, kategori: 'Tabungan', ket: `Cairin ${x.aset || x.jenis}`, akun: SAVE, ke_akun: x.akun }));
  }
  return out;
}
export async function portfolio() {
  const all = await saves();
  const by = new Map();
  for (const s of all) {
    const k = `${s.jenis}|${s.aset}`;
    const p = by.get(k) ?? { jenis: s.jenis, aset: s.aset, modal: 0, nilai: null, nilaiTgl: '' };
    if (s.aksi === 'setor') p.modal += s.nominal;
    if (s.aksi === 'tarik') p.modal -= s.nominal;
    if (s.aksi === 'nilai' && s.tanggal >= p.nilaiTgl) { p.nilai = s.nominal; p.nilaiTgl = s.tanggal; }
    by.set(k, p);
  }
  const list = [...by.values()].filter((p) => p.modal > 0 || p.nilai);
  const total = list.reduce((s, p) => s + (p.nilai ?? p.modal), 0);
  return { list, total, modal: list.reduce((s, p) => s + p.modal, 0) };
}

// ---------- rekap pagi: uang siap pakai, tagihan s/d akhir bulan, jatah harian biar cukup sebulan
export async function morning(t = today()) {
  const [all, bl, pf] = await Promise.all([txs(), bills(), portfolio().catch(() => ({ list: [], total: 0 }))]);
  const saldo = balances(all);
  const cash = Object.values(saldo).reduce((s, v) => s + v, 0);
  const [y, m, d] = t.split('-').map(Number);
  const end = `${t.slice(0, 8)}${String(lastDay(y, m)).padStart(2, '0')}`;
  const days = lastDay(y, m) - d + 1;
  const due = bl.filter((b) => b.aktif).map((b) => ({ b, d: nextDue(b, t) })).filter((x) => x.d && x.d.date <= end);
  const reserve = due.reduce((s, x) => s + x.b.nominal, 0);
  const daily = Math.max(0, (cash - reserve) / days);
  // bagi jatah pakai pola 30 hari terakhir (default 50/20/30)
  const ago = addDays(t, -30);
  const recent = all.filter((r) => r.tipe === 'keluar' && r.tanggal >= ago && r.tanggal < t && !/tagihan|utang|cicil|langgan|penyesuaian|tabungan/i.test(r.kategori));
  const part = { makan: 0, bensin: 0, lain: 0 };
  for (const r of recent) part[/makan|minum|jajan/i.test(r.kategori) ? 'makan' : /transport|bensin|bbm|parkir/i.test(`${r.kategori} ${r.ket}`) ? 'bensin' : 'lain'] += r.nominal;
  // dicampur pembagian default (50/20/30) senilai Rp500rb biar data yang masih sedikit nggak bikin jatah 0
  const DEF = { makan: 0.5, bensin: 0.2, lain: 0.3 }, K = 500000;
  const tot = part.makan + part.bensin + part.lain + K;
  const share = Object.fromEntries(Object.keys(DEF).map((k) => [k, (part[k] + DEF[k] * K) / tot]));
  const r1k = (n) => rp(Math.floor(n / 1000) * 1000);
  const kemarin = addDays(t, -1);
  const spentY = all.filter((r) => r.tipe === 'keluar' && r.tanggal === kemarin && !/tagihan|utang|cicil|langgan|penyesuaian/i.test(r.kategori)).reduce((s, r) => s + r.nominal, 0);
  const late = due.filter((x) => x.d.date < t);
  return [
    `💰 Uang siap pakai: <b>${rp(cash)}</b>${Object.keys(saldo).length > 1 ? `\n   ${Object.entries(saldo).map(([k, v]) => `${k} ${rp(v)}`).join(' · ')}` : ''}`,
    due.length ? `🧾 Tagihan belum dibayar s/d ${end.slice(8)}/${end.slice(5, 7)}: <b>${rp(reserve)}</b>\n${due.map((x) => `   • ${x.b.nama} ${rp(x.b.nominal)} (tgl ${x.d.date.slice(8)}${x.d.date < t ? ', TELAT' : ''})`).join('\n')}` : '🧾 Nggak ada tagihan yang belum dibayar bulan ini',
    `📅 Sisa ${days} hari sampai akhir bulan`,
    cash - reserve > 0
      ? `✅ Jatah hari ini maks <b>${r1k(daily)}</b>\n   🍛 makan ${r1k(daily * share.makan)} · ⛽ bensin ${r1k(daily * share.bensin)} · 🛒 lainnya ${r1k(daily * share.lain)}`
      : `⚠️ Uang siap pakai nggak cukup buat nutup tagihan bulan ini (kurang ${rp(reserve - cash)})`,
    spentY ? `📉 Kemarin keluar ${rp(spentY)}` : '📉 Kemarin belum ada pengeluaran yang kecatet',
    pf.list.length ? `🏦 Tabungan & investasi: ${rp(pf.total)} (${pf.list.map((p) => p.aset).join(', ')})` : '',
    late.length ? `🚨 ${late.map((x) => x.b.nama).join(', ')} udah lewat jatuh tempo!` : '',
  ].filter(Boolean).join('\n');
}
// pengingat tagihan H-5 & H-3 (yang belum dibayar)
export async function reminders(t = today()) {
  return (await bills()).filter((b) => b.aktif).map((b) => ({ b, d: nextDue(b, t) })).filter((x) => x.d && [5, 3].includes(diffDays(t, x.d.date)))
    .map((x) => ({ ...x, left: diffDays(t, x.d.date) }));
}
export async function todayTx(t = today()) { return (await txs()).filter((r) => r.tanggal === t); }

if (process.argv[1]?.endsWith('finance.mjs')) {
  const [cmd, ...a] = process.argv.slice(2);
  try {
    if (cmd === 'add') console.log((await addTx(JSON.parse(a[0]))).join('\n'));
    else if (cmd === 'list') {
      const [dari, sampai, q] = a;
      const sel = (await txs()).filter(inRange(dari, sampai)).filter((r) => !q || `${r.kategori} ${r.ket} ${r.akun} ${r.ke_akun}`.toLowerCase().includes(q.toLowerCase()));
      console.log(sel.slice(-60).map(fmtTx).join('\n') || '(kosong)');
    } else if (cmd === 'sum') console.log(await summary(a[0], a[1]));
    else if (cmd === 'del') console.log(`dihapus: ${(await sheet('del', 'Transaksi', { ids: a.map(Number) })).ids.join(', ') || '(tidak ada)'}`);
    else if (cmd === 'edit') {
      const x = JSON.parse(a[1]);
      if (x.tipe && !TIPE.includes(x.tipe)) throw new Error('tipe salah');
      const map = { tanggal: 'Tanggal', tipe: 'Tipe', nominal: 'Nominal', kategori: 'Kategori', ket: 'Keterangan', akun: 'Akun', ke_akun: 'Ke Akun' };
      const set = Object.fromEntries(Object.entries(x).filter(([k]) => map[k]).map(([k, v]) => [map[k], k === 'nominal' ? num(v) : v]));
      console.log(`diubah: #${(await sheet('edit', 'Transaksi', { id: Number(a[0]), set })).id}`);
    } else if (cmd === 'bill') {
      const [sub, ...b] = a;
      if (sub === 'add') {
        const x = JSON.parse(b[0]);
        if (!x.nama || !(num(x.nominal) > 0) || !(num(x.tgl) >= 1 && num(x.tgl) <= 31)) throw new Error('butuh nama, nominal > 0, tgl 1–31');
        const { ids } = await sheet('add', 'Tagihan', { rows: [{ Nama: x.nama, Jenis: x.jenis || 'tagihan', Nominal: num(x.nominal), 'Jatuh Tempo': num(x.tgl), Akun: x.akun || '', 'Sisa Kali': x.sisa === '' || x.sisa == null ? '' : num(x.sisa), 'Lunas Periode': x.lunas || '', Aktif: 'ya', Catatan: x.catatan || '' }] });
        console.log(fmtBill((await bills()).find((r) => r.id === ids[0])));
      } else if (sub === 'list') console.log((await bills()).map((r) => fmtBill(r)).join('\n') || '(belum ada tagihan)');
      else if (sub === 'pay') console.log(await payBill(b[0], b[1], b[2], b[3]));
      else if (sub === 'edit') {
        const x = JSON.parse(b[1]);
        const map = { nama: 'Nama', jenis: 'Jenis', nominal: 'Nominal', tgl: 'Jatuh Tempo', akun: 'Akun', sisa: 'Sisa Kali', lunas: 'Lunas Periode', aktif: 'Aktif', catatan: 'Catatan' };
        const set = Object.fromEntries(Object.entries(x).filter(([k]) => map[k]).map(([k, v]) => [map[k], k === 'aktif' ? (v === false || v === 'tidak' ? 'tidak' : 'ya') : v]));
        console.log(`diubah: tagihan #${(await sheet('edit', 'Tagihan', { id: Number(b[0]), set })).id}`);
      } else if (sub === 'del') console.log(`dihapus: ${(await sheet('del', 'Tagihan', { ids: b.map(Number) })).ids.join(', ') || '(tidak ada)'}`);
      else console.log('bill add|list|pay|edit|del');
    } else if (cmd === 'save') {
      const [sub, ...b] = a;
      if (sub === 'add') console.log((await addSave(JSON.parse(b[0]))).join('\n'));
      else if (sub === 'list') {
        const p = await portfolio();
        console.log(p.list.map((x) => `${x.jenis} · ${x.aset}: modal ${rp(x.modal)}${x.nilai != null ? ` · nilai ${rp(x.nilai)} (${x.nilaiTgl})` : ''}`).join('\n') || '(belum ada tabungan)');
        console.log(`Total ${rp(p.total)} (modal ${rp(p.modal)})`);
        const rows = await saves();
        console.log(rows.slice(-15).map((s) => `#${s.id} ${s.tanggal} ${s.aksi} ${s.aset} ${rp(s.nominal)} ${s.unit ?? ''} ${s.akun ?? ''}`).join('\n'));
      } else if (sub === 'del') console.log(`dihapus: ${(await sheet('del', 'Tabungan', { ids: b.map(Number) })).ids.join(', ') || '(tidak ada)'} (transaksi pindah terkait hapus manual pakai del)`);
      else console.log('save add|list|del');
    } else if (cmd === 'morning') console.log((await morning(a[0])).replace(/<\/?b>/g, ''));
    else if (cmd === 'remind') console.log((await reminders(a[0])).map((x) => `H-${x.left} ${x.b.nama} ${rp(x.b.nominal)} (${x.d.date})`).join('\n') || '(tidak ada)');
    else if (cmd === 'today') console.log((await todayTx(a[0])).map(fmtTx).join('\n') || '(kosong)');
    else console.log('pakai: add | list | sum | del | edit | bill … | save … | morning | remind | today (lihat header file)');
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    process.exitCode = 1;
  }
}
