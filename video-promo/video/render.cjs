/*
 * Crea il video: un fotogramma alla volta da index.html (Playwright), poi voce + musica con ffmpeg.
 * Uso (dalla cartella video-promo): node video/render.cjs [uscita.mp4] [--da=sec --a=sec per una prova]
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const qui = __dirname, base = path.join(qui, '..');
const arg = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const uscita = process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(base, 'uscita', 'video-portale.mp4');
const FPS = Number(arg.fps || 30);

const testi = JSON.parse(fs.readFileSync(path.join(base, 'testi.json'), 'utf8'));
const durate = {};
for (const b of testi.battute) durate[b.id] = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(base, 'voce', b.id + '.mp3')]).toString());
fs.writeFileSync(path.join(qui, 'dati.js'), `window.DURATE = ${JSON.stringify(durate)};\nwindow.TESTI = ${JSON.stringify(Object.fromEntries(testi.battute.map(b => [b.id, b.scritta])))};\n`);

(async () => {
  fs.mkdirSync(path.dirname(uscita), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + path.join(qui, 'index.html'));
  await p.waitForFunction(() => [...document.images].every(i => i.complete));
  const totale = await p.evaluate(() => window.DURATA_TOTALE);
  const scene = await p.evaluate(() => window.SCENE.map(s => ({ id: s.id, inizio: s.inizio })));
  const da = Number(arg.da || 0), a = Math.min(Number(arg.a || totale), totale);
  console.log(`Durata ${totale.toFixed(1)} s, fotogrammi da ${da} a ${a}`);
  if (arg.fotogrammi) {  // prova: solo alcuni fotogrammi in PNG (es. --fotogrammi=12,31.5)
    for (const t of arg.fotogrammi.split(',')) { await p.evaluate(t => window.mostra(t), Number(t)); await p.screenshot({ path: uscita.replace(/\.mp4$/, `-${t}.png`) }); }
    console.log(scene.map(s => `${s.id} ${s.inizio.toFixed(1)}`).join(' · ')); await b.close(); return;
  }
  const muto = uscita.replace(/\.mp4$/, '-muto.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', muto]);
  for (let f = Math.round(da * FPS); f < Math.round(a * FPS); f++) {
    await p.evaluate(t => window.mostra(t), f / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % (FPS * 5) === 0) console.log(`  ${(f / FPS).toFixed(0)} s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await b.close();
  // audio: voce di ogni scena all'inizio della scena + 0,5 s, musica sotto (abbassata quando parla la voce)
  const wav = path.join(path.dirname(uscita), 'musica.wav');
  execFileSync('python3', [path.join(base, 'musica.py'), String(totale), wav]);
  const ingressi = ['-i', muto, '-i', wav], filtri = [];
  scene.forEach((s, i) => {
    ingressi.push('-i', path.join(base, 'voce', s.id + '.mp3'));
    const ms = Math.round((s.inizio + 0.5 - da) * 1000);
    if (ms >= 0) filtri.push(`[${i + 2}:a]adelay=${ms}|${ms},volume=1.6[v${i}]`);
  });
  const voci = filtri.map((_, i) => `[v${i}]`).join('');
  const f = [`[1:a]atrim=start=${da},asetpts=PTS-STARTPTS,volume=0.32[m]`, ...filtri,
    `${voci}amix=inputs=${filtri.length}:normalize=0,apad[voce]`, `[voce]asplit[voce1][voce2]`,
    `[m][voce1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[mb]`, `[mb][voce2]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`].join(';');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ingressi, '-filter_complex', f, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(a - da), uscita]);
  fs.unlinkSync(muto);
  console.log('Video pronto:', uscita);
})();
