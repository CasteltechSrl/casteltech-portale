/*
 * Motore del video: disegna il fotogramma del secondo t (window.mostra(t)). Niente animazioni del browser:
 * tutto dipende solo da t, così render.cjs può catturare un fotogramma alla volta senza scatti.
 * Durate delle battute in window.DURATE (scritte da render.cjs dalla voce generata).
 */
(function () {
  const $ = s => document.querySelector(s);
  const palco = $('#palco');
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const lin = x => Math.max(0, Math.min(1, x));
  const mix = (a, b, k) => a + (b - a) * k;
  const finestra = 1440 / 1600;
  const PRIMA = 0.5, DOPO = 0.75;            // pausa prima della voce nella scena e dopo
  const DURATE = window.DURATE;

  // inizio e durata di ogni scena
  let t0 = 0;
  const scene = window.STORIA.map(s => {
    const voce = DURATE[s.id] ?? 5;
    const dur = PRIMA + voce + DOPO + (s.extra === 'finale' ? 2.5 : 0) + (s.extra === 'caos' ? 0.3 : 0);
    const sc = { ...s, inizio: t0, dur, voce };
    t0 += dur; return sc;
  });
  window.DURATA_TOTALE = t0;
  window.SCENE = scene;

  // ── elementi fissi ──
  palco.innerHTML = `<div id="griglia"></div><div id="strato-caos"></div>
    <div id="finestra"><div id="barra"><i></i><i></i><i></i><div id="indirizzo">portale.tuaazienda.it</div></div><div id="vista"></div></div>
    <div id="strato-extra"></div><div id="capitolo"></div><div id="sottotitolo"></div>`;
  const vista = $('#vista'), fin = $('#finestra'), cap = $('#capitolo'), sott = $('#sottotitolo'), extra = $('#strato-extra'), caos = $('#strato-caos');
  const immagini = {};
  const img = nome => {
    if (!immagini[nome]) { const i = document.createElement('img'); i.src = `riprese/${nome}.png`; vista.appendChild(i); immagini[nome] = i; }
    return immagini[nome];
  };
  scene.forEach(s => (s.riprese || []).forEach(r => img(r.img)));

  // ── testi delle scritte (sottotitoli): la battuta divisa in pezzi, tempo in proporzione alle lettere ──
  const testi = window.TESTI;
  function sottotitolo(s, tl) {
    const b = testi[s.id]; if (!b) return '';
    const pezzi = b.match(/[^.!?:…]+[.!?:…]*\s*/g).map(x => x.trim()).filter(Boolean);
    // pezzi troppo corti si uniscono al successivo
    const uniti = [];
    for (const p of pezzi) { if (uniti.length && uniti[uniti.length - 1].length < 28) uniti[uniti.length - 1] += ' ' + p; else uniti.push(p); }
    const tot = uniti.reduce((a, p) => a + p.length, 0);
    let x = (tl - PRIMA) / s.voce * tot;
    if (x < 0) return tl > PRIMA - 0.3 ? uniti[0] : '';
    for (const p of uniti) { if (x < p.length) return p; x -= p.length; }
    return tl < s.dur - 0.25 ? uniti[uniti.length - 1] : '';
  }

  // ── telecamera sulle pagine ──
  function camera(keys, tl) {
    if (tl <= keys[0][0]) return keys[0].slice(1);
    for (let i = 1; i < keys.length; i++) if (tl <= keys[i][0]) {
      const k = ease((tl - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
      return [1, 2, 3].map(j => mix(keys[i - 1][j], keys[i][j], k));
    }
    return keys[keys.length - 1].slice(1);
  }
  function mostraRiprese(s, tl) {
    const visibili = new Map();
    for (const r of s.riprese || []) {
      const da = r.da ?? 0, a = Math.min(r.a ?? 99, s.dur);
      const ent = da === 0 ? 1 : lin((tl - da) / 0.45), usc = a >= s.dur ? 1 : lin((a - tl) / 0.45 + 1);
      if (tl < da - 0.01 || tl > a + 0.45) continue;
      const op = Math.min(ent, tl > a ? lin(1 - (tl - a) / 0.45) : 1);
      const [x, y, z] = camera(r.cam, tl - da);
      const k = finestra * z;
      visibili.set(r.img, { op: Math.max(visibili.get(r.img)?.op ?? 0, op), tr: `translate(${-x * k}px, ${-y * k}px) scale(${k * 1600 / 1600})`, r, x, y, k, tl: tl - da, z: tl > a ? 0 : 1 });
    }
    for (const [nome, el] of Object.entries(immagini)) {
      const v = visibili.get(nome);
      el.style.opacity = v ? v.op : 0;
      if (v) { el.style.transform = `translate(${-v.x * v.k}px, ${-v.y * v.k}px) scale(${v.k})`; el.style.zIndex = v.z; }
    }
    // riquadri evidenziati
    vista.querySelectorAll('.evid').forEach(e => e.remove());
    for (const v of visibili.values()) for (const e of v.r.evid || []) {
      const [da, a, x, y, w, h, col] = e;
      if (v.tl < da || v.tl > a) continue;
      const op = Math.min(lin((v.tl - da) / 0.35), lin((a - v.tl) / 0.35)) * v.op;
      const d = document.createElement('div'); d.className = 'evid' + (col ? ' ' + col : '');
      const pad = 6;
      Object.assign(d.style, { left: (x - v.x) * v.k - pad + 'px', top: (y - v.y) * v.k - pad + 'px', width: w * v.k + 2 * pad + 'px', height: h * v.k + 2 * pad + 'px', opacity: op });
      vista.appendChild(d);
    }
  }

  // ── scena 1: file e programmi sparsi ──
  const CARTE = [
    ['RFQ_offerta.eml', '#e8590c', 'EML'], ['BOM_rev3.xlsx', '#2f9e44', 'XLS'], ['Gerber_topbot.zip', '#5f3dc4', 'ZIP'], ['Ordine_4521.pdf', '#c92a2a', 'PDF'],
    ['Fattura_118.xml', '#1971c2', 'XML'], ['DDT_77.pdf', '#c92a2a', 'PDF'], ['Listino_2026.xlsx', '#2f9e44', 'XLS'], ['Tempi_reparto.xlsx', '#2f9e44', 'XLS'],
    ['Estratto_conto.csv', '#495057', 'CSV'], ['Preventivo_v2.docx', '#1864ab', 'DOC'], ['PickPlace.txt', '#495057', 'TXT'], ['Sollecito.eml', '#e8590c', 'EML'],
    ['Conferma_ord.pdf', '#c92a2a', 'PDF'], ['Fornitori.xlsx', '#2f9e44', 'XLS'],
  ];
  const PROG = ['Posta', 'Fogli Excel', 'Gestionale', 'Visualizzatore CAD', 'Fatturazione', 'Home banking', 'Calendario', 'Cartelle condivise', 'Rubrica clienti', 'Programma tempi'];
  let rnd = 11; const caso = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  const posCarte = CARTE.map((c, i) => ({ x: 120 + caso() * 1560, y: 140 + caso() * 760, r: (caso() - .5) * 40, d: i * 0.35 + 0.2, dx: (caso() - .5) * 80, dy: (caso() - .5) * 60 }));
  const posProg = PROG.map((p, i) => ({ x: 80 + (i % 5) * 360 + caso() * 80, y: i < 5 ? 70 + caso() * 40 : 930 + caso() * 30, d: 4.5 + i * 0.32 }));
  caos.innerHTML = CARTE.map(c => `<div class="carta"><div class="ico" style="background:${c[1]}">${c[2]}</div>${c[0]}</div>`).join('')
    + PROG.map(p => `<div class="prog">${p}</div>`).join('');
  const carteEl = [...caos.querySelectorAll('.carta')], progEl = [...caos.querySelectorAll('.prog')];

  function mostraCaos(tl, scena) {
    // scena: 'caos' (si accumulano) o 'reveal' (volano dentro la finestra)
    caos.style.display = '';
    carteEl.forEach((el, i) => {
      const p = posCarte[i];
      if (scena === 'caos') {
        const k = ease((tl - p.d) / 0.6), agita = Math.sin(tl * 2.2 + i) * 6;
        const dim = lin((tl - 6.2) / 0.5);
        el.style.opacity = lin((tl - p.d) / 0.3) * (1 - 0.55 * dim);
        el.style.filter = `blur(${dim * 3}px)`;
        el.style.transform = `translate(${p.x + p.dx * (1 - k)}px, ${p.y - 120 * (1 - k) + agita}px) rotate(${p.r + Math.sin(tl * 1.3 + i) * 3}deg) scale(${0.7 + 0.3 * k})`;
      } else {
        const k = ease(tl / 1.1 - i * 0.03);
        el.style.opacity = 1 - lin((tl - 0.5 - i * 0.03) / 0.6);
        el.style.filter = '';
        el.style.transform = `translate(${mix(p.x, 845, k)}px, ${mix(p.y, 500, k)}px) rotate(${p.r * (1 - k)}deg) scale(${mix(1, 0.3, k)})`;
      }
    });
    progEl.forEach((el, i) => {
      const p = posProg[i];
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      el.style.opacity = scena === 'caos' ? lin((tl - p.d) / 0.4) * 0.9 : 0;
    });
  }

  // ── fotogramma ──
  window.mostra = function (t) {
    const s = scene.find(x => t >= x.inizio && t < x.inizio + x.dur) || scene[scene.length - 1];
    const tl = t - s.inizio;
    extra.innerHTML = '';
    caos.style.display = 'none';
    // finestra: nascosta nel caos, cresce nel reveal, si rimpicciolisce nel finale
    let fs = 1, fo = 1, fy = 0;
    if (s.extra === 'caos') { fo = 0; mostraCaos(tl, 'caos'); }
    else if (s.extra === 'reveal') { mostraCaos(tl, 'reveal'); const k = ease((tl - 0.35) / 1.2); fs = mix(0.2, 1, k); fo = lin((tl - 0.35) / 0.4); }
    else if (s.extra === 'finale') { const k = ease(tl / 1.2); fs = mix(1, 0.6, k); fy = mix(0, 60, k); fo = 1 - k; }
    fin.style.opacity = fo; fin.style.transform = `translateY(${fy}px) scale(${fs})`;
    mostraRiprese(s.extra === 'finale' ? { riprese: [{ img: 'cruscotto', cam: [[0, 0, 0, 1]] }], dur: 99 } : s, tl);

    // capitolo in alto a sinistra
    if (s.capitolo) { cap.innerHTML = `<b>${s.capitolo[0]}</b>${s.capitolo[1]}`; cap.style.opacity = Math.min(lin(tl / 0.4), lin((s.dur - tl) / 0.3)); cap.style.transform = `translateX(${(1 - ease(tl / 0.5)) * -30}px)`; }
    else cap.style.opacity = 0;
    const st = sottotitolo(s, tl); sott.textContent = st; sott.style.opacity = st ? 1 : 0;

    // testi grandi e badge
    if (s.extra === 'caos') {
      const k = lin((tl - 6.4) / 0.5);
      extra.innerHTML = `<div class="grande" style="top:430px;font-size:92px;opacity:${k};transform:scale(${mix(1.2, 1, ease(k))});text-shadow:0 10px 40px #000">10 programmi diversi.</div>`;
    }
    if (s.extra === 'reveal') {
      const k = lin((tl - 1.6) / 0.5);
      extra.innerHTML = `<div class="grande" style="top:${mix(990, 960, ease(k))}px;font-size:46px;opacity:${k * (1 - lin((tl - s.dur + 0.4) / 0.3))}">Un solo portale. <span style="color:var(--accento)">Tutta l'azienda.</span></div>`;
      sott.style.opacity = 0;
    }
    if (s.extra === 'ia') {
      const k = lin((tl - 0.5) / 0.4), out = lin((s.dur - tl) / 0.3);
      extra.innerHTML = `<div class="badge" style="right:150px;top:30px;opacity:${k * out};transform:scale(${1 + 0.05 * Math.sin(tl * 5)})">✦ Intelligenza artificiale</div>`
        + (tl > 10.9 ? `<div class="badge blu" style="right:150px;top:${mix(120, 96, ease((tl - 10.9) / 0.4))}px;opacity:${lin((tl - 10.9) / 0.4) * out}">Preventivo pronto in pochi secondi</div>` : '');
    }
    if (s.extra === 'telefono') {
      const k = ease((tl - 0.6) / 0.6), out = lin((3.4 - tl) / 0.3);
      extra.innerHTML = `<div style="position:absolute;left:${mix(1950, 1530, k)}px;top:300px;width:300px;height:600px;border-radius:40px;background:#0f1522;border:10px solid #1f2733;box-shadow:0 30px 80px rgba(0,0,0,.6);opacity:${out};padding:46px 20px;font-size:18px;color:#1d2633">
        <div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px"><div style="font-size:13px;color:#667">Commessa C2026-0001</div><div style="font-weight:700;font-size:20px">NE-MC410 · 300 pz</div></div>
        <div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px"><div style="font-size:13px;color:#667">Fase in corso</div><div style="font-weight:700">6 · Pick&amp;Place TOP</div><div style="margin-top:8px;font-size:30px;font-weight:800;color:#0b7a68">01:42:10</div></div>
        <div style="background:#19c2a6;color:#04201c;border-radius:14px;padding:14px;text-align:center;font-weight:800">Chiudi fase ✓</div></div>`;
    }
    if (s.extra === 'finale') {
      const a = lin((tl - 0.6) / 0.5), b = lin((tl - 2.4) / 0.5), c = lin((tl - 4.6) / 0.5);
      extra.innerHTML = `<div class="grande" style="top:300px;font-size:96px;opacity:${a};transform:translateY(${(1 - ease(a)) * 20}px)">Dalla email alla fattura.</div>
        <div class="grande" style="top:440px;font-size:52px;font-weight:600;color:var(--tenue);opacity:${b}">Un solo portale. <span style="color:var(--accento)">Semplice. Completo.</span></div>
        <div style="position:absolute;left:50%;top:600px;transform:translateX(-50%) scale(${mix(0.9, 1, ease(c))});opacity:${c};padding:20px 50px;border-radius:44px;background:var(--accento);color:#04201c;font-size:38px;font-weight:800;box-shadow:0 14px 50px rgba(25,194,166,.55)">Richiedi una demo</div>
        <div class="grande" style="top:730px;font-size:26px;font-weight:500;color:var(--tenue);opacity:${c}">Il gestionale con intelligenza artificiale per chi produce elettronica</div>`;
    }
  };
})();
