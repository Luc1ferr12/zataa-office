"""Word timings for karaoke captions: whisper.cpp per-word timestamps aligned to the script words.
python tools/words.py <lines.json> <vo dir>   → <vo dir>/words.json = {"L1": [[word, t0, t1], ...], ...}
Script spelling is kept (whisper only supplies the times); unmatched words are interpolated."""
import json, os, re, subprocess, sys, difflib, tempfile
W = 'C:/Users/arkan/AppData/Local/Programs/whisper.cpp'
lines, vo = sys.argv[1], sys.argv[2]
norm = lambda s: re.sub(r'[^0-9a-z]', '', s.lower())
out = {}
for it in json.load(open(lines, encoding='utf8'))['items']:
    wav = os.path.join(vo, it['id'].lower() + '.wav')
    tmp = os.path.join(tempfile.gettempdir(), '_wl.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ar', '16000', '-ac', '1', tmp], check=True)
    r = subprocess.run([f'{W}/Release/whisper-cli', '-m', f'{W}/models/ggml-large-v3-turbo-q5_0.bin', '-l', 'id', '-ml', '1', '-sow', '-np', '-f', tmp], capture_output=True, text=True, encoding='utf8')
    hw = []
    for m in re.finditer(r'\[(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)\]\s+(\S.*)', r.stdout):
        t0 = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]); t1 = int(m[4]) * 3600 + int(m[5]) * 60 + float(m[6])
        for w in m[7].split(): hw.append((norm(w), t0, t1))
    sw = it['text'].replace('…', ' ').replace('...', ' ').split()
    sm = difflib.SequenceMatcher(a=[norm(w) for w in sw], b=[h[0] for h in hw], autojunk=False)
    times = [None] * len(sw); matched = 0
    for a, b, n in sm.get_matching_blocks():
        for k in range(n): times[a + k] = (hw[b + k][1], hw[b + k][2]); matched += 1
    end = hw[-1][2] if hw else 1.0
    i = 0
    while i < len(sw):                       # interpolate gaps by character length between known anchors
        if times[i]: i += 1; continue
        j = i
        while j < len(sw) and not times[j]: j += 1
        a0 = times[i - 1][1] if i else 0.0; b0 = times[j][0] if j < len(sw) else end
        tot = sum(len(w) for w in sw[i:j]) or 1; c = a0
        for k in range(i, j): d = (b0 - a0) * len(sw[k]) / tot; times[k] = (c, c + d); c += d
        i = j
    out[it['id']] = [[w, round(a, 3), round(b, 3)] for w, (a, b) in zip(sw, times)]
    print(it['id'], len(sw), 'words,', matched, 'matched', flush=True)
json.dump(out, open(os.path.join(vo, 'words.json'), 'w', encoding='utf8'), ensure_ascii=False)
