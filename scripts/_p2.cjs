const fs=require('fs');const p=__dirname+'/clipper.mjs';let s=fs.readFileSync(p,'utf8');
const BS=String.fromCharCode(92);
// 1) review() sebelum post()
const marker="// ---------- upload hasil render laptop → TikTok + IG";
if(!s.includes(marker)) throw 'marker';
const review=`// ---------- hasil render → Owner dulu (video + hook + caption), tayang HANYA setelah ✅
async function tgVideo(file, caption, extra = {}) {
  const tok = env().CLIPPER_BOT_TOKEN;
  const fd = new FormData();
  fd.append('chat_id', String(owner()));
  fd.append('caption', caption.slice(0, 1000));
  fd.append('parse_mode', 'HTML');
  fd.append('supports_streaming', 'true');
  for (const [k, v] of Object.entries(extra)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  fd.append('video', new Blob([readFileSync(file)], { type: 'video/mp4' }), 'clip.mp4');
  const r = await fetch(\`https://api.telegram.org/bot\${tok}/sendVideo\`, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(\`Telegram sendVideo: \${j.description}\`);
  return j.result;
}
export async function review(jobId) {
  const d = cdb();
  const j = d.prepare('SELECT j.*, c.title ctitle FROM clip_jobs j JOIN clip_campaigns c ON c.id = j.campaign_id WHERE j.id = ?').get(+jobId);
  if (!j?.file) throw new Error(\`job \${jobId} belum ada file\`);
  const file = join(ROOT, j.file);
  if (!existsSync(file)) throw new Error(\`file \${j.file} nggak ada di VPS\`);
  const cap = \`🎬 <b>Clip #\${j.id} — \${esc(j.ctitle)}</b>\${BS}nHook: <i>\${esc(j.hook ?? '')}</i>\${BS}n\${BS}nCaption:\${BS}n\${esc(j.caption ?? '')}\${BS}n\${BS}nTayang ke TikTok + IG setelah kamu ✅.\`;
  await tgVideo(file, cap, { reply_markup: { inline_keyboard: [[{ text: '✅ Approve & tayang', callback_data: \`cv:ok:\${j.id}\` }, { text: '❌ Tolak (bikin ulang)', callback_data: \`cv:no:\${j.id}\` }]] } });
  setAgent(d, 'cedit', 'waiting', \`Clip #\${j.id} nunggu ✅ Bos\`);
  return \`clip #\${j.id} dikirim ke Owner buat approval\`;
}
export async function decideClip(jobId, ok) {
  const d = cdb();
  const j = d.prepare('SELECT * FROM clip_jobs WHERE id = ?').get(+jobId);
  if (!j) return 'job nggak ketemu';
  if (j.status !== 'review') return \`clip #\${j.id} sudah \${j.status}, nggak diproses lagi\`;
  if (!ok) {
    d.prepare("UPDATE clip_jobs SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(j.id);
    d.prepare('INSERT INTO clip_jobs (campaign_id, day, source_url) VALUES (?, ?, ?)').run(j.campaign_id, today(), j.source_url);
    return \`❌ Clip #\${j.id} ditolak, tim bikin versi baru (laptop ±10 menit).\`;
  }
  d.prepare("UPDATE clip_jobs SET status = 'ready', updated_at = datetime('now') WHERE id = ?").run(j.id);
  await post(j.id);
  return \`✅ Clip #\${j.id} di-approve, lagi diupload.\`;
}

`.replaceAll('${BS}n','\n');
s=s.replace(marker, review+marker);
// 2) callback handler
const old="          const [, act, id] = String(u.callback_query.data).split(':');\n          const msg = await decide(id, act === 'ok');";
if(!s.includes(old)) throw 'cb';
s=s.replace(old,"          const [kind, act, id] = String(u.callback_query.data).split(':');\n          const msg = kind === 'cv' ? await decideClip(id, act === 'ok') : await decide(id, act === 'ok');");
s=s.replace("text: act === 'ok' ? 'Siap, masuk produksi' : 'Oke, dilewati' }","text: kind === 'cv' ? (act === 'ok' ? 'Approve, diupload' : 'Ditolak, dibikin ulang') : (act === 'ok' ? 'Siap, masuk produksi' : 'Oke, dilewati') }");
s=s.replace("await sayAs(act === 'ok' ? 'cdir' : 'cdir', msg);\n          if (act === 'ok') plan();","await sayAs(kind === 'cv' ? 'cpublish' : 'cdir', msg);\n          if (act === 'ok' && kind !== 'cv') plan();");
// 3) CLI
s=s.replace("    else if (cmd === 'post') show(await post(a));","    else if (cmd === 'post') show(await post(a));\n    else if (cmd === 'review') show(await review(a));");
fs.writeFileSync(p,s);
