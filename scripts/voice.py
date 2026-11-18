# Voice over OmniVoice (mesin VoiceStudio, k2-fsa/OmniVoice) — suara natural, bahasa Indonesia.
# Profil suara = 1 rekaman referensi di assets/voices/<nama>.wav (+ .txt transkrip) supaya
# suaranya konsisten di semua adegan (tanpa referensi, instruct menghasilkan suara acak tiap kalimat).
#
#   python scripts/voice.py design <nama> "<instruct>" "<kalimat contoh>"   # bikin profil baru
#   python scripts/voice.py say <jobs.json>                                  # dipanggil render.mjs
# jobs.json = {"voice": "<nama>", "items": [{"text": "...", "speed": 1.05, "out": "x.wav"}]}
import json, os, sys
import numpy as np
import soundfile as sf
import torch
from omnivoice import OmniVoice

# ---- normalisasi teks untuk TTS Indonesia: angka → kata ("18 Desember 2026" → "delapan belas Desember dua ribu dua puluh enam")
import re
_SAT = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']

def terbilang(n):
    if n < 12: return _SAT[n]
    if n < 20: return _SAT[n - 10] + ' belas'
    if n < 100: return _SAT[n // 10] + ' puluh' + (' ' + _SAT[n % 10] if n % 10 else '')
    if n < 200: return 'seratus' + (' ' + terbilang(n - 100) if n > 100 else '')
    if n < 1000: return _SAT[n // 100] + ' ratus' + (' ' + terbilang(n % 100) if n % 100 else '')
    if n < 2000: return 'seribu' + (' ' + terbilang(n - 1000) if n > 1000 else '')
    if n < 10**6: return terbilang(n // 1000) + ' ribu' + (' ' + terbilang(n % 1000) if n % 1000 else '')
    if n < 10**9: return terbilang(n // 10**6) + ' juta' + (' ' + terbilang(n % 10**6) if n % 10**6 else '')
    if n < 10**12: return terbilang(n // 10**9) + ' miliar' + (' ' + terbilang(n % 10**9) if n % 10**9 else '')
    return ' '.join(_SAT[int(c)] for c in str(n))

_PRON = {'MCU': 'Em Si Yu', 'VFX': 'Vi Ef Ek', 'CGI': 'Si Ji Ai', 'AI': 'E Ai'}

def normalize(t):
    t = t.replace('*', '')
    t = re.sub(r'\b(ke)-(\d+)', lambda m: 'ke' + terbilang(int(m.group(2))), t)  # ke-2 -> kedua
    t = re.sub(r'(\d+),(\d+)', lambda m: terbilang(int(m.group(1))) + ' koma ' + ' '.join(_SAT[int(c)] for c in m.group(2)), t)  # 2,5
    t = re.sub(r'\d{1,3}(?:\.\d{3})+', lambda m: terbilang(int(m.group(0).replace('.', ''))), t)  # 1.000.000
    t = re.sub(r'(\d+)\s*%', lambda m: terbilang(int(m.group(1))) + ' persen', t)
    t = re.sub(r'\d+', lambda m: terbilang(int(m.group(0))) if len(m.group(0)) < 13 else m.group(0), t)
    for k, v in _PRON.items(): t = re.sub(r'\b' + k + r'\b', v, t)
    return re.sub(r'\s+', ' ', t).strip()


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICES = os.path.join(ROOT, 'assets', 'voices')
SR = 24000


def load():
    dev = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    return OmniVoice.from_pretrained('k2-fsa/OmniVoice', device_map=dev, dtype=torch.float16 if dev != 'cpu' else torch.float32)


def trim(a, thr=0.01):
    # buang hening di awal/akhir, sisakan 60 ms
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    pad = int(SR * 0.06)
    return a[max(idx[0] - pad, 0):min(idx[-1] + pad, len(a))]


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'design':
        name, instruct, text = sys.argv[2:5]
        os.makedirs(VOICES, exist_ok=True)
        audio = load().generate(text=text, language='id', instruct=instruct)
        sf.write(os.path.join(VOICES, f'{name}.wav'), trim(audio[0]), SR)
        with open(os.path.join(VOICES, f'{name}.txt'), 'w', encoding='utf8') as f: f.write(text)
        print(json.dumps({'ok': True, 'voice': name}))
    elif cmd == 'say':
        with open(sys.argv[2], encoding='utf8') as f: job = json.load(f)
        ref = os.path.join(VOICES, f"{job['voice']}.wav")
        if not os.path.exists(ref): sys.exit(f"profil suara {job['voice']} tidak ada di assets/voices/")
        with open(ref[:-4] + '.txt', encoding='utf8') as f: ref_text = f.read().strip()
        model = load()
        for it in job['items']:
            audio = model.generate(text=normalize(it['text']), language='id', ref_audio=ref, ref_text=ref_text, speed=it.get('speed'))
            sf.write(it['out'], trim(audio[0]), SR)
        print(json.dumps({'ok': True, 'n': len(job['items'])}))
    else:
        print(__doc__ or 'pakai: voice.py design|say ...')


if __name__ == '__main__':
    main()
