# Template konten Zataa

Isi `data_json` konten, set `template`, lalu render. **Jangan tulis HTML baru.** Contoh lengkap tiap template ada di `templates/samples/*.json`.

```bash
node scripts/render.mjs <content_id>                  # → docs/media/<tanggal>/, asset_path otomatis terisi
node scripts/render.mjs try <template> <data.json>    # coba tanpa DB → out/
```
Hasil feed/carousel: JPG 1080×1080 (IG, 1:1) + `-916.jpg` 1080×1920 (TikTok). Video: MP4 1080×1920 30fps + `-cover.jpg`.

## Aturan teks
- `*kata*` → warna aksen game, `**kata**` → tebal putih. Emoji boleh.
- `game`: `mlbb` (emas) · `valorant` (merah) · `freefire` (oranye) · `other`. Kosongkan kalau konten umum.
- Harga **hanya** dari zataa.my.id hari itu. Teks terlalu panjang dikecilkan otomatis, tapi tetap patuhi batas kata di playbook Copywriter.
- `cta` default "Top up di zataa.my.id"; `footnote` opsional (mis. "Harga per 11 Okt").

## Feed (`template`)
| template | data_json |
|---|---|
| `promo` | `kicker, headline, sub, items:[{name, price:"Rp 21.500", old?, tag?}] (≤4)` |
| `news` | `label: BERITA\|RUMOR\|PATCH\|TRANSFER\|ESPORT, date, headline, sub, points:[≤3], source, photo?, pre?` — `photo` = path foto (mis. `assets/photos/x.jpg`) → layout foto bernuansa ungu + judul besar (points tidak tampil), `pre` = teks kecil di atas judul. Foto pemain hanya kalau Owner minta |
| `versus` | `event, headline, left:{name, sub, short?, logo?}, right:{…sama}, time` — `logo` = path file (mis. `assets/teams/rrq.png`), tidak ada → lambang inisial `short` |
| `tips` | `kicker, headline, items:[{title, desc}] (3–5)` |
| `quiz` | `kicker: KUIS\|POLLING, headline, sub?, options:[2–4]` |
| `carousel` | `slides:[{kind:"hook", headline, sub} · {kind:"point", title, body, n?} · {kind:"cta", headline, sub}]` (5–7 slide) |

## Video (`format: video`, template otomatis `video`)
`data_json = { game, gameName?, duration?, music?, scenes:[...] }` (nama game otomatis di kanan atas; `gameName` untuk game di luar ML/Valorant/FF) — durasi dinormalkan ke 15–30 dtk, adegan CTA ditambah otomatis kalau tidak ada.

| `t` | field | default dtk |
|---|---|---|
| `hook` | `text, sub?` | 2.6 |
| `point` | `title, body?, n?` (`n:false` = tanpa nomor) | 3.2 |
| `list` | `title?, items:[teks ≤7 kata]` | 1.4 + 0.55/item |
| `price` | `title?, items:[{name, price}]` (angka berhitung naik) | 1.6 + 0.55/item |
| `versus` | `title?, left, right, sub?` | 3.6 |
| `cta` | `text?, button?` | 3.6 |

Field `dur` per adegan untuk atur manual. `music`: nama file di `assets/audio/` (bebas lisensi); tanpa itu video berisi audio senyap.
