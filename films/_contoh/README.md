# Film contoh per divisi (lemo-opuscar)

Titik awal film Shorts tiap divisi. **Jangan desain dari nol**: salin satu folder ke `films/<slug>/` (atau `node scripts/film.mjs new <slug> --brand=…` lalu salin file dari sini), ganti cerita, adegan & `lines.json`, cek dengan `node scripts/film.mjs check films/<slug>`.

| Folder | Divisi | Gaya | Catatan |
|---|---|---|---|
| `cowo-brick-toy/` | Cowo Bingung | `brick-toy` | **Kontrak lengkap**: timeline dari `out/vo/dur.json`, caption per kata `karaoke()` dari `out/vo/words.json`, `lines.json` dengan `el` (tag ekspresi ElevenLabs). Contoh paling lengkap, tiru pola kodenya. |
| `story-shadow-puppet/` | Zaa Story | `shadow-puppet` | Timeline dari `dur.json`; caption per kata belum ada → tambahkan pola `karaoke()` dari film Cowo Bingung. |
| `history-woodcut/` | Zaa History | `woodcut` | Timeline masih detik tetap → ganti ke `dur.json` + tambah `karaoke()` saat dipakai. |

Marvel Talk (`pop-art`) & About Esports (`caption-news`) belum punya contoh: film pertama dibuat dari `~/lemo-opuscar/styles/<gaya>/STYLE.md` + `DIRECTOR.md`, lalu setelah di-✅ Owner disimpan di sini.
Font tidak disimpan di git: `tools/fonts.sh` (kalau ada) mengunduhnya saat build.
