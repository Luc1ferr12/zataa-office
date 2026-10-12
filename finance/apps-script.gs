// Catatan keuangan Owner — Google Apps Script (tempel di Extensions → Apps Script pada Google Sheet kosong).
// Bot Telegram (Aprista, scripts/finance.mjs di VPS) baca & tulis lewat web app ini. Data cuma di sheet ini, nggak masuk web kantor.
// Pasang: 1) jalankan setup() sekali → izinkan akses → salin FINANCE_SHEET_TOKEN dari Execution log
//         2) Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) → salin URL /exec
//         3) di VPS ~/zataa-office/.env: FINANCE_SHEET_URL=<url> dan FINANCE_SHEET_TOKEN=<token>
const SHEET = 'Transaksi';
const HEAD = ['ID', 'Tanggal', 'Tipe', 'Nominal', 'Kategori', 'Keterangan', 'Akun', 'Ke Akun', 'Dicatat'];

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Makassar');
  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET, 0);
  if (sh.getLastRow() === 0) sh.appendRow(HEAD);
  sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold').setBackground('#ede9fe');
  sh.setFrozenRows(1);
  sh.getRange('B:B').setNumberFormat('@');            // tanggal disimpan teks yyyy-mm-dd (anti geser zona waktu)
  sh.getRange('D:D').setNumberFormat('#,##0');
  sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['masuk', 'keluar', 'pindah']).build());

  // ringkasan otomatis (rumus, ikut update kalau sheet diisi manual juga)
  const rs = ss.getSheetByName('Ringkasan') || ss.insertSheet('Ringkasan');
  rs.clear();
  rs.getRange('A1:B1').setValues([['Ringkasan', '']]).setFontWeight('bold');
  // catatan: rumus dari Apps Script selalu pakai koma & nama fungsi Inggris; bulan dibentuk tanpa TEXT tanggal biar aman di locale apa pun
  const BULAN = 'YEAR(TODAY())&"-"&TEXT(MONTH(TODAY()),"00")';
  rs.getRange('A2:B5').setFormulas([
    ['="Total masuk"', `=SUMIF(${SHEET}!C:C,"masuk",${SHEET}!D:D)`],
    ['="Total keluar"', `=SUMIF(${SHEET}!C:C,"keluar",${SHEET}!D:D)`],
    ['="Saldo"', '=B2-B3'],
    ['="Keluar bulan ini"', `=SUMPRODUCT((${SHEET}!C2:C="keluar")*(LEFT(${SHEET}!B2:B,7)=${BULAN}),${SHEET}!D2:D)`],
  ]);
  rs.getRange('B2:B5').setNumberFormat('#,##0');
  rs.getRange('D1').setValue('Pengeluaran per kategori (bulan ini)').setFontWeight('bold');
  rs.getRange('D2').setFormula(`=IFERROR(QUERY(${SHEET}!A:I,"select E, sum(D) where C = 'keluar' and B starts with '"&${BULAN}&"' group by E order by sum(D) desc label E 'Kategori', sum(D) 'Total'",1),"(belum ada)")`);
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(s1);

  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('TOKEN')) p.setProperty('TOKEN', Utilities.getUuid());
  Logger.log('FINANCE_SHEET_TOKEN=' + p.getProperty('TOKEN'));
}

const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'json' }); }
  if (!b.token || b.token !== PropertiesService.getScriptProperties().getProperty('TOKEN')) return out({ ok: false, error: 'token' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
    const last = sh.getLastRow();
    const rows = last > 1 ? sh.getRange(2, 1, last - 1, HEAD.length).getValues() : [];
    const rowOf = (id) => rows.findIndex((r) => String(r[0]) === String(id));
    if (b.action === 'list') return out({ ok: true, head: HEAD, rows });
    if (b.action === 'add') {
      let next = rows.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
      const now = Utilities.formatDate(new Date(), 'Asia/Makassar', 'yyyy-MM-dd HH:mm');
      const add = (b.rows || []).map((x) => [++next, x.tanggal, x.tipe, Number(x.nominal) || 0, x.kategori || '', x.ket || '', x.akun || '', x.ke_akun || '', now]);
      if (add.length) sh.getRange(last + 1, 1, add.length, HEAD.length).setValues(add);
      return out({ ok: true, ids: add.map((r) => r[0]) });
    }
    if (b.action === 'del') {
      const done = [];
      for (const id of [].concat(b.ids || []).sort((a, c) => rowOf(c) - rowOf(a))) {  // hapus dari bawah biar nomor baris nggak geser
        const i = rowOf(id);
        if (i >= 0) { sh.deleteRow(i + 2); done.push(id); }
      }
      return out({ ok: true, ids: done });
    }
    if (b.action === 'edit') {
      const i = rowOf(b.id);
      if (i < 0) return out({ ok: false, error: 'id tidak ada' });
      const cols = { tanggal: 2, tipe: 3, nominal: 4, kategori: 5, ket: 6, akun: 7, ke_akun: 8 };
      for (const [k, c] of Object.entries(cols)) if (b.set && k in b.set) sh.getRange(i + 2, c).setValue(k === 'nominal' ? Number(b.set[k]) || 0 : b.set[k]);
      return out({ ok: true, id: b.id });
    }
    return out({ ok: false, error: 'action' });
  } finally {
    lock.releaseLock();
  }
}
