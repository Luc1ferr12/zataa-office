// Catatan keuangan Owner — Google Apps Script (tempel di Extensions → Apps Script pada Google Sheet).
// Bot Telegram Aprista (@zataaaccountingbot, scripts/finance.mjs di VPS) baca & tulis lewat web app ini. Data cuma di sheet ini.
// Generik: sheet & kolom dikirim dari VPS (finance.mjs HEADS), sheet baru dibuat otomatis → fitur baru nggak perlu deploy ulang.
// Pasang: 1) jalankan setup() → salin FINANCE_SHEET_TOKEN dari Execution log
//         2) Deploy → Web app (Execute as: Me, Who has access: Anyone) → URL /exec
//         Update script: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL tetap sama)
const BASE = {
  Transaksi: ['ID', 'Tanggal', 'Tipe', 'Nominal', 'Kategori', 'Keterangan', 'Akun', 'Ke Akun', 'Dicatat'],
  Tagihan: ['ID', 'Nama', 'Jenis', 'Nominal', 'Jatuh Tempo', 'Akun', 'Sisa Kali', 'Lunas Periode', 'Aktif', 'Catatan', 'Dicatat'],
  Tabungan: ['ID', 'Tanggal', 'Jenis', 'Aset', 'Aksi', 'Unit', 'Nominal', 'Akun', 'Keterangan', 'Dicatat'],
};

function sheetOf(name, head) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 && head) {
    sh.appendRow(head);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#ede9fe');
    sh.setFrozenRows(1);
    head.forEach((h, i) => {
      if (/^(Tanggal|Lunas Periode|Dicatat)$/.test(h)) sh.getRange(1, i + 1, sh.getMaxRows()).setNumberFormat('@'); // teks, anti geser zona waktu
      if (h === 'Nominal') sh.getRange(2, i + 1, sh.getMaxRows() - 1).setNumberFormat('#,##0');
    });
  }
  return sh;
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Makassar');
  for (const [n, h] of Object.entries(BASE)) sheetOf(n, h);
  const T = 'Transaksi';
  const rs = ss.getSheetByName('Ringkasan') || ss.insertSheet('Ringkasan');
  rs.clear();
  // rumus dari Apps Script selalu pakai koma & nama fungsi Inggris; bulan dibentuk tanpa TEXT tanggal biar aman di locale apa pun
  const BULAN = 'YEAR(TODAY())&"-"&TEXT(MONTH(TODAY()),"00")';
  rs.getRange('A1').setValue('Ringkasan (angka pasti ada di bot: "saldo", "rekap")').setFontWeight('bold');
  rs.getRange('A2:B7').setFormulas([
    ['="Total masuk"', `=SUMIF(${T}!C:C,"masuk",${T}!D:D)`],
    ['="Total keluar"', `=SUMIF(${T}!C:C,"keluar",${T}!D:D)`],
    ['="Uang siap pakai"', `=B2-B3-SUMIFS(${T}!D:D,${T}!C:C,"pindah",${T}!H:H,"Tabungan")+SUMIFS(${T}!D:D,${T}!C:C,"pindah",${T}!G:G,"Tabungan")`],
    ['="Tabungan (modal)"', '=SUMIF(Tabungan!E:E,"setor",Tabungan!G:G)-SUMIF(Tabungan!E:E,"tarik",Tabungan!G:G)'],
    ['="Keluar bulan ini"', `=SUMPRODUCT((${T}!C2:C="keluar")*(LEFT(${T}!B2:B,7)=${BULAN}),${T}!D2:D)`],
    ['="Tagihan aktif / bulan"', '=SUMIF(Tagihan!I:I,"ya",Tagihan!D:D)'],
  ]);
  rs.getRange('B2:B7').setNumberFormat('#,##0');
  rs.getRange('D1').setValue('Pengeluaran per kategori (bulan ini)').setFontWeight('bold');
  rs.getRange('D2').setFormula(`=IFERROR(QUERY(${T}!A:I,"select E, sum(D) where C = 'keluar' and B starts with '"&${BULAN}&"' group by E order by sum(D) desc label E 'Kategori', sum(D) 'Total'",1),"(belum ada)")`);
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('TOKEN')) p.setProperty('TOKEN', Utilities.getUuid());
  Logger.log('FINANCE_SHEET_TOKEN=' + p.getProperty('TOKEN'));
}

const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// body: { token, action: list|add|del|edit, sheet, head, rows (objek per nama kolom), ids, id, set }
function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'json' }); }
  if (!b.token || b.token !== PropertiesService.getScriptProperties().getProperty('TOKEN')) return out({ ok: false, error: 'token' });
  const name = b.sheet || 'Transaksi';
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheetOf(name, b.head || BASE[name]);
    const last = sh.getLastRow(), cols = Math.max(sh.getLastColumn(), 1);
    const head = sh.getRange(1, 1, 1, cols).getValues()[0].map(String);
    const rows = last > 1 ? sh.getRange(2, 1, last - 1, cols).getValues() : [];
    const rowOf = (id) => rows.findIndex((r) => String(r[0]) === String(id));
    if (b.action === 'list') return out({ ok: true, head, rows });
    if (b.action === 'add') {
      let next = rows.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
      const now = Utilities.formatDate(new Date(), 'Asia/Makassar', 'yyyy-MM-dd HH:mm');
      const add = (b.rows || []).map((x) => head.map((h) => (h === 'ID' ? ++next : h === 'Dicatat' ? now : x[h] ?? '')));
      if (add.length) sh.getRange(last + 1, 1, add.length, cols).setValues(add);
      return out({ ok: true, ids: add.map((r) => r[0]) });
    }
    if (b.action === 'del') {
      const done = [];
      for (const id of [].concat(b.ids || []).sort((a, c) => rowOf(c) - rowOf(a))) { // hapus dari bawah biar nomor baris nggak geser
        const i = rowOf(id);
        if (i >= 0) { sh.deleteRow(i + 2); done.push(id); }
      }
      return out({ ok: true, ids: done });
    }
    if (b.action === 'edit') {
      const i = rowOf(b.id);
      if (i < 0) return out({ ok: false, error: 'id tidak ada' });
      for (const [k, v] of Object.entries(b.set || {})) {
        const c = head.indexOf(k);
        if (c > 0) sh.getRange(i + 2, c + 1).setValue(v);
      }
      return out({ ok: true, id: b.id });
    }
    return out({ ok: false, error: 'action' });
  } finally {
    lock.releaseLock();
  }
}
