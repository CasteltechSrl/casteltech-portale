"""Genera le battute della voce (edge-tts) per le due versioni: voce/maschile/*.mp3 e voce/femminile/*.mp3.
Battute con "stringi": true = pause tra le parole accorciate (serve ffmpeg)."""
import json, os, subprocess, sys
qui = os.path.dirname(os.path.abspath(__file__))
t = json.load(open(os.path.join(qui, 'testi.json')))
solo = sys.argv[1:]  # facoltativo: id delle battute da rifare (es. v1)
STRINGI = 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.18:stop_threshold=-45dB:stop_silence=0.14'
for nome, v in t['voci'].items():
    os.makedirs(os.path.join(qui, 'voce', nome), exist_ok=True)
    for b in t['battute']:
        if solo and b['id'] not in solo: continue
        out = os.path.join(qui, 'voce', nome, b['id'] + '.mp3')
        grezzo = out + '.grezzo.mp3' if b.get('stringi') else out
        subprocess.run(['edge-tts', '--voice', v['voce'], '--rate', b.get('velocita', v['velocita']), '--text', b['voce'],
                        '--write-media', grezzo], check=True, capture_output=True)
        if b.get('stringi'):
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', grezzo, '-af', STRINGI, out], check=True)
            os.remove(grezzo)
    print('voce', nome, 'pronta')
