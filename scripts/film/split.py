"""Potong satu take narasi (mis. ElevenLabs sekali jalan) jadi per baris lines.json: lN.wav + dur.json.
python split.py <take.wav> <lines.json> <outdir>
whisper.cpp kasih waktu per kata → dicocokkan ke kata naskah → potong di titik paling sunyi di antara akhir baris i dan awal baris i+1."""
import json, os, re, subprocess, sys, difflib, tempfile
import numpy as np, soundfile as sf
W = os.environ.get('WHISPER_DIR', 'C:/Users/arkan/AppData/Local/Programs/whisper.cpp')
take, lines, out = sys.argv[1:4]
norm = lambda s: re.sub(r'[^0-9a-z]', '', s.lower())
items = json.load(open(lines, encoding='utf8'))['items']
x, sr = sf.read(take, dtype='float32')
if x.ndim > 1: x = x.mean(1)
tmp = os.path.join(tempfile.gettempdir(), '_split16.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', take, '-ar', '16000', '-ac', '1', tmp], check=True)
r = subprocess.run([f'{W}/Release/whisper-cli', '-m', f'{W}/models/ggml-large-v3-turbo-q5_0.bin', '-l', 'id', '-ml', '1', '-sow', '-np', '-f', tmp], capture_output=True, text=True, encoding='utf8')
hw = []
for m in re.finditer(r'\[(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)\]\s+(\S.*)', r.stdout):
    t0 = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]); t1 = int(m[4]) * 3600 + int(m[5]) * 60 + float(m[6])
    for w in m[7].split(): hw.append((norm(w), t0, t1))
if not hw: sys.exit('whisper tidak menangkap kata apa pun')
# kata naskah + indeks baris
sw, owner = [], []
for i, it in enumerate(items):
    for w in it['text'].replace('…', ' ').replace('...', ' ').split():
        if norm(w): sw.append(norm(w)); owner.append(i)
sm = difflib.SequenceMatcher(a=sw, b=[h[0] for h in hw], autojunk=False)
t_of = [None] * len(sw)
for a, b, n in sm.get_matching_blocks():
    for k in range(n): t_of[a + k] = (hw[b + k][1], hw[b + k][2])
starts, ends = [], []
for i in range(len(items)):
    ts = [t_of[k] for k in range(len(sw)) if owner[k] == i and t_of[k]]
    if not ts: sys.exit(f'baris L{i + 1} tidak ketemu di rekaman (salah baca?)')
    starts.append(ts[0][0]); ends.append(ts[-1][1])
# energi 10 ms → titik potong paling sunyi di sela baris
h = int(.01 * sr); e = np.sqrt(np.convolve(x ** 2, np.ones(h) / h, 'same'))
cut = [0]
for i in range(len(items) - 1):
    a, b = int(max(0, ends[i] - .15) * sr), int((starts[i + 1] + .05) * sr)
    if b <= a: b = a + h
    cut.append(a + int(np.argmin(e[a:b])))
cut.append(len(x))
os.makedirs(out, exist_ok=True)
dur = {}
for i, it in enumerate(items):
    w = x[cut[i]:cut[i + 1]]; k = np.where(np.abs(w) > .01)[0]
    if len(k): w = w[max(0, k[0] - int(.06 * sr)): k[-1] + int(.12 * sr)]
    n = min(len(w) // 4, int(.01 * sr)); w = w.copy()
    if n: w[:n] *= np.linspace(0, 1, n); w[-n:] *= np.linspace(1, 0, n)
    sf.write(os.path.join(out, it['id'].lower() + '.wav'), w.astype(np.float32), sr)
    dur[it['id']] = round(len(w) / sr, 3)
json.dump(dur, open(os.path.join(out, 'dur.json'), 'w'))
print(json.dumps(dur))
