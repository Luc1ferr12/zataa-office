// Tema mode Pixel Art HD: palet sama dengan tema 3D (blender/office_themes.py — kalau palet di sana diubah, samakan di sini).
// pal: override warna per nama material scene.js · leaf: (gelap, tengah, terang) kanopi · grass: (rumput, terang) · sky/night: langit
export const PIXEL_THEMES = {
  vanilla: {"pal":{},"leaf":["#3a8536","#5aac45","#86cc5a"],"grass":["#5cae45","#86cf5c"],"sky":"#c4b2e2","night":"#2c2550"},
  anime: {"pal":{"plaster":"#fff8ee","slat":"#e2b383","tread":"#d39f6e","deck":"#e8b98a","walnut":"#a8704c","furn":"#a8704c","grass":"#5fd36a","grassDark":"#4cc25a","hedge":"#4fc768","black":"#2b2838","leather":"#2f2b3f","sofa":"#6b5bd6","glass":"#bfe8ff","dark":"#3a3550","navy":"#3b3a78"},"leaf":["#2f9a4a","#4cbf5c","#78d870"],"grass":["#62d36c","#8ce58a"],"sky":"#9fdcff","night":"#1e2a5a"},
  cartoon: {"pal":{"plaster":"#fff3c4","slat":"#ff9f43","tread":"#e8812a","deck":"#ffb35c","walnut":"#c2562b","furn":"#c2562b","grass":"#4cd137","hedge":"#3fc030","black":"#2d3436","leather":"#d63031","sofa":"#0984e3","steel":"#74b9ff","glass":"#81ecec","dark":"#2d3436","navy":"#0652dd","chrome":"#dfe6e9","white":"#ffffff","ytRed":"#ff3838"},"leaf":["#1f9a4a","#33c25a","#5ad874"],"grass":["#4cd137","#6ae154"],"sky":"#74d4ff","night":"#1a2a6a"},
  medieval: {"pal":{"plaster":"#a59a88","ledge":"#6e665a","ledgeDark":"#4f4a42","slat":"#5e4330","tread":"#4f3726","deck":"#6b4c34","walnut":"#4a3020","furn":"#4a3020","lightwood":"#7a5a3c","white":"#c9bea8","marble":"#b7ab95","black":"#2a221c","leather":"#5a2a22","sofa":"#6e1f2a","steel":"#5d5a55","chrome":"#8a8070","glass":"#d9b86a","glassRail":"#c9a85a","navy":"#3a2a1e","grass":"#5d7a3a","grassDark":"#4d6a30","hedge":"#4a6a32","rug":"#6e1f2a","meetCarpet":"#3e4a28","purple":"#6e1f2a","dark":"#2a221c","slab":"#3b332b","pot":"#5a4a3a","potLight":"#a08a6a","poolEdge":"#b0a48e"},"leaf":["#3e5a2a","#5a7a38","#7c9a4a"],"grass":["#56723a","#6e8a46"],"sky":"#c9a07a","night":"#1a1420"},
  futuristic: {"pal":{"plaster":"#eef1f7","slat":"#1b1d26","tread":"#262935","deck":"#2a2d3a","walnut":"#e9edf5","furn":"#e9edf5","lightwood":"#d7dce8","black":"#0d0e14","leather":"#f2f4f8","sofa":"#2fd6ff","steel":"#c9d2e3","chrome":"#eef3ff","glass":"#7fe6ff","glassRail":"#8af0ff","navy":"#141826","grass":"#244a3e","grassDark":"#1d3d33","hedge":"#2a6a5a","dark":"#10121a","slab":"#181b26","white":"#f6f8fc","marble":"#e6eaf2","ytRed":"#ff2d7a","purple":"#8b5cf6","rug":"#141826","meetCarpet":"#1a1e2c","pot":"#e9edf5"},"leaf":["#1f8a7a","#2fc2a8","#7af0d6"],"grass":["#203f36","#2a5246"],"sky":"#3a4a80","night":"#06070f"},
  jungle: {"pal":{"plaster":"#7f8a6a","ledge":"#5a6448","ledgeDark":"#45503a","slat":"#b59a5a","tread":"#a08648","deck":"#b8a060","walnut":"#6e5a34","furn":"#6e5a34","lightwood":"#c8b070","black":"#25261c","leather":"#4a3a22","sofa":"#3e6a3a","grass":"#3f8a2e","grassDark":"#2f7426","hedge":"#2f7a2a","glass":"#bfe6c8","navy":"#2a3a26","rug":"#5a4a22","dark":"#2a2e20","white":"#e2dcc2","marble":"#c8c2a8","steel":"#7a7a62"},"leaf":["#1f5a22","#2f8a32","#5cb84a"],"grass":["#2f7a28","#4a9a36"],"sky":"#b8d8a8","night":"#10201a"},
  disney: {"pal":{"plaster":"#fbe6f0","slat":"#f3d2b8","tread":"#e8c0a2","deck":"#f6dcc4","walnut":"#c98a9a","furn":"#c98a9a","lightwood":"#f6dcc4","black":"#3a2e5a","leather":"#6a4a9a","sofa":"#9b7be0","steel":"#d8c8f0","chrome":"#f4e6ff","glass":"#e6d8ff","glassRail":"#f0e6ff","navy":"#4a3a8a","grass":"#8fd68a","grassDark":"#7cc87a","hedge":"#7ccf86","dark":"#4a3a6a","white":"#fff8fc","marble":"#fdf0f6","brass":"#f2c94c","gold":"#f2c94c","purple":"#a678f0","rug":"#e7a6c9","meetCarpet":"#b9a2e8","pot":"#f2c94c","umbrella2":"#f39ac7"},"leaf":["#e58bb5","#f6b3d2","#ffe1ef"],"grass":["#86d283","#a9e3a0"],"sky":"#ffd6ec","night":"#2a1f5a"},
};

export const PIXEL_THEME_LIST = [
  { id: 'klasik', label: 'Klasik' }, { id: 'vanilla', label: 'Vanilla' }, { id: 'anime', label: 'Anime' }, { id: 'cartoon', label: 'Cartoon' },
  { id: 'medieval', label: 'Medieval' }, { id: 'futuristic', label: 'Modern Futuristik' }, { id: 'jungle', label: 'Jungle' }, { id: 'disney', label: 'Disney' },
];

// ganti warna material sebelum renderScene (worker / thread utama); warna asli disimpan → bisa balik ke tema lain/klasik
export function applyPixelTheme(M, ramp, id) {
  for (const m of Object.values(M)) if (m.orig) { m.color = m.orig; m.ramp = ramp(m.orig); }
  const th = PIXEL_THEMES[id];
  if (!th) return;
  const set = (name, color) => { const m = M[name]; if (m && color) { m.orig ??= m.color; m.color = color; m.ramp = ramp(color); } };
  const [ld, lm, ll] = th.leaf;
  set('foliageDark', ld); set('foliage', lm); set('palm', lm); set('foliageLight', ll); set('hedge', ld);
  set('grass', th.grass[0]);
  for (const [k, v] of Object.entries(th.pal)) set(k, v);
}
