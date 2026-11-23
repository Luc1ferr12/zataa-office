"""VoxCPM2 narration (CPU): design a new female voice once, then clone it for every line so the voice stays the same.
  python vox.py design <outdir>            → <outdir>/ref_s{1,2,3}.wav + ref.txt (three takes of the reference sentence)
  python vox.py say <ref.wav> <ref.txt> <lines.json> <outdir>   → <outdir>/lN.wav (+ dur.json)
lines.json = {"items": [{"id": "L1", "text": "..."}]}
"""
import json, os, sys, time
import numpy as np, soundfile as sf
import torch
from voxcpm import VoxCPM

DESC = ("A young Indonesian woman in her early twenties, bright, cheerful and playful voice, clear crisp articulation, "
        "warm smile in the voice, energetic short-video storyteller, medium-fast pace")
REF_TEXT = ("Halo! Hari ini kita bongkar satu fakta nyeleneh yang ternyata jenius banget. "
            "Siap? Yuk, kita coba bikin sendiri, pelan-pelan aja ya.")

def load():
    t0 = time.time(); m = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, device=os.environ.get('VOX_DEVICE', 'cpu'), optimize=False, local_files_only=True); print('model loaded', round(time.time() - t0), 's', flush=True); return m

def trim(a, sr, thr=.01, pad=.06):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    s, e = max(0, idx[0] - int(pad * sr)), min(len(a), idx[-1] + int(pad * sr)); return a[s:e]

def main():
    cmd = sys.argv[1]
    m = load(); sr = m.tts_model.sample_rate
    if cmd == 'design':
        out = sys.argv[2]; os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'ref.txt'), 'w', encoding='utf8').write(REF_TEXT)
        for seed in (1, 2, 3):
            t0 = time.time(); torch.manual_seed(seed); w = m.generate(text=f'({DESC}){REF_TEXT}', cfg_value=2.0, inference_timesteps=10)
            sf.write(os.path.join(out, f'ref_s{seed}.wav'), trim(np.asarray(w, np.float32), sr), sr); print('take', seed, round(time.time() - t0), 's', flush=True)
    elif cmd == 'say':
        ref, reftxt, lines, out = sys.argv[2:6]; os.makedirs(out, exist_ok=True)
        rt = open(reftxt, encoding='utf8').read().strip(); items = json.load(open(lines, encoding='utf8'))['items']; dur = {}
        only = set(sys.argv[6].split(',')) if len(sys.argv) > 6 else None
        for it in items:
            if only and it['id'] not in only: continue
            t0 = time.time()
            torch.manual_seed(it.get('seed', 7))
            if it.get('style'):   # mode B: clone the timbre only, intonation from a per-line style instruction
                w = m.generate(text=f"({it['style']}){it['text']}", reference_wav_path=ref, cfg_value=2.0, inference_timesteps=int(os.environ.get('VOX_STEPS', 25)))
            else:                 # mode A: ultimate cloning (prosody follows the reference sentence)
                w = m.generate(text=it['text'], prompt_wav_path=ref, prompt_text=rt, reference_wav_path=ref, cfg_value=2.0, inference_timesteps=10)
            a = trim(np.asarray(w, np.float32), sr); sf.write(os.path.join(out, it['id'].lower() + '.wav'), a, sr)
            dur[it['id']] = len(a) / sr; print(it['id'], round(dur[it['id']], 2), 's audio,', round(time.time() - t0), 's', flush=True)
        p = os.path.join(out, 'dur.json'); old = json.load(open(p)) if os.path.exists(p) else {}; old.update(dur); json.dump(old, open(p, 'w'))

main()
