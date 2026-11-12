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
  const PAUSE = { caos: [0.15, 0.35] };       // scena iniziale più stretta (Adriano 12/11/2026: inizio di 8–9 s)
  const DURATE = window.DURATE;

  // inizio e durata di ogni scena
  let t0 = 0;
  const scene = window.STORIA.map(s => {
    const voce = DURATE[s.id] ?? 5;
    const [prima, dopo] = PAUSE[s.extra] || [PRIMA, DOPO];
    const dur = prima + voce + dopo + (s.extra === 'finale' ? 2.5 : 0);
    const sc = { ...s, inizio: t0, dur, voce, prima };
    t0 += dur; return sc;
  });
  window.DURATA_TOTALE = t0;
  window.SCENE = scene;

  // ── elementi fissi ──
  palco.innerHTML = `<div id="griglia"></div><div id="sfondo-intro"><i></i><i></i><i></i><i></i></div><div id="strato-caos"></div>
    <div id="finestra"><div id="barra"><i></i><i></i><i></i><div id="indirizzo">portale.tuaazienda.it</div></div><div id="vista"></div></div>
    <div id="strato-extra"></div><div id="capitolo"></div><div id="sottotitolo"></div>`;
  const vista = $('#vista'), fin = $('#finestra'), cap = $('#capitolo'), sott = $('#sottotitolo'), extra = $('#strato-extra'), caos = $('#strato-caos'), sfondo = $('#sfondo-intro'), griglia = $('#griglia');
  const macchie = [...sfondo.querySelectorAll('i')];
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
    let x = (tl - s.prima) / s.voce * tot;
    if (x < 0) return tl > s.prima - 0.3 ? uniti[0] : '';
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
  const posCarte = CARTE.map((c, i) => ({ x: 120 + caso() * 1560, y: 140 + caso() * 760, r: (caso() - .5) * 40, d: 0.1 + i * 0.2, dx: (caso() - .5) * 80, dy: (caso() - .5) * 60 }));
  const posProg = PROG.map((p, i) => ({ x: 80 + (i % 5) * 360 + caso() * 80, y: i < 5 ? 70 + caso() * 40 : 930 + caso() * 30, d: 2.9 + i * 0.17 }));
  caos.innerHTML = CARTE.map(c => `<div class="carta"><div class="ico" style="background:${c[1]}">${c[2]}</div>${c[0]}</div>`).join('')
    + PROG.map(p => `<div class="prog">${p}</div>`).join('');
  const carteEl = [...caos.querySelectorAll('.carta')], progEl = [...caos.querySelectorAll('.prog')];

  // momento della scritta "10 programmi diversi." = verso la fine della voce della scena iniziale
  const scenaCaos = scene.find(x => x.extra === 'caos');
  const tDieci = scenaCaos ? scenaCaos.prima + scenaCaos.voce - 1.7 : 6.4;

  // sfondo caldo della scena iniziale: macchie di colore sfumate che si muovono piano (al posto della griglia)
  const MACCHIE = [['#ff7a45', 560, 380, 0.9], ['#d6336c', 1380, 300, 1.3], ['#7048e8', 1250, 820, 0.7], ['#19c2a6', 420, 860, 1.1]];
  function mostraSfondo(t, op) {
    sfondo.style.opacity = op; griglia.style.opacity = 0.10 * (1 - op);
    macchie.forEach((el, i) => {
      const [col, x, y, v] = MACCHIE[i];
      const dx = Math.sin(t * 0.35 * v + i * 1.7) * 140, dy = Math.cos(t * 0.28 * v + i) * 90, sc = 1 + 0.12 * Math.sin(t * 0.5 + i);
      el.style.background = `radial-gradient(circle, ${col} 0%, transparent 65%)`;
      el.style.transform = `translate(${x + dx - 450}px, ${y + dy - 450}px) scale(${sc})`;
    });
  }

  function mostraCaos(tl, scena) {
    // scena: 'caos' (si accumulano) o 'reveal' (volano dentro la finestra)
    caos.style.display = '';
    carteEl.forEach((el, i) => {
      const p = posCarte[i];
      if (scena === 'caos') {
        const k = ease((tl - p.d) / 0.6), agita = Math.sin(tl * 2.2 + i) * 6;
        const dim = lin((tl - tDieci + 0.2) / 0.5);
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

  // ── scena delle macchine collegate: quattro macchine intorno alla finestra del portale, linee con i dati che scorrono ──
  const MACCHINE = [
    ['Armadi di stoccaggio', '▤', 'Bobine in armadio', 1248, '', 70, 230],
    ['Pick & Place', '⊕', 'Componenti montati', 18420, '', 70, 650],
    ['SPI', '◎', 'Pasta controllata', 99.6, ' % ok', 1520, 230],
    ['AOI', '◉', 'Schede controllate', 312, '', 1520, 650],
  ];
  function macchine(tl) {
    const finX = 960, finY = 540 + 25, mezzaL = 1440 * 0.52 / 2;
    let svg = '', carte = '';
    MACCHINE.forEach(([nome, ico, cosa, valore, unita, x, y], i) => {
      const k = ease((tl - 3.0 - i * 0.3) / 0.6); if (k <= 0) return;
      const sinistra = x < 960, cx = sinistra ? x + 330 : x, cy = y + 75;
      const ax = sinistra ? finX - mezzaL : finX + mezzaL, ay = finY + (cy < finY ? -120 : 120);
      const lk = lin((tl - 3.3 - i * 0.3) / 0.5);
      svg += `<line x1="${cx}" y1="${cy}" x2="${mix(cx, ax, lk)}" y2="${mix(cy, ay, lk)}" stroke="#19c2a6" stroke-width="3" stroke-dasharray="8 8" opacity="${0.8 * k}"/>`;
      if (lk >= 1) for (let j = 0; j < 3; j++) { const f = (tl * 0.7 + j / 3 + i * 0.13) % 1; svg += `<circle cx="${mix(cx, ax, f)}" cy="${mix(cy, ay, f)}" r="7" fill="#7ff5e0" opacity="${Math.sin(f * Math.PI)}"/>`; }
      const conta = valore * (1 + 0.002 * Math.max(0, tl - 4) * (valore > 100 ? 4 : 0));
      const testo = valore % 1 ? conta.toFixed(1).replace('.', ',') : Math.round(conta).toLocaleString('it-IT');
      carte += `<div class="macchina" style="left:${x + (sinistra ? -40 : 40) * (1 - k)}px;top:${y}px;opacity:${k}">
        <div class="ico">${ico}</div><div><div class="nome">${nome}</div><div class="cosa">${cosa}</div><div class="valore">${testo}${unita}</div></div>
        <i class="luce"></i></div>`;
    });
    const badge = lin((tl - 4.2) / 0.4);
    return `<svg style="position:absolute;inset:0;width:1920px;height:1080px">${svg}</svg>${carte}`
      + `<div class="badge" style="left:50%;top:${mix(150, 130, ease(badge))}px;transform:translateX(-50%);opacity:${badge * lin((s_dur_macchine - tl) / 0.3)}">Dati dalle macchine, senza scrivere niente</div>`;
  }
  const s_dur_macchine = (scene.find(x => x.extra === 'macchine') || { dur: 99 }).dur;

  // ── fotogramma ──
  window.mostra = function (t) {
    const s = scene.find(x => t >= x.inizio && t < x.inizio + x.dur) || scene[scene.length - 1];
    const tl = t - s.inizio;
    extra.innerHTML = '';
    caos.style.display = 'none';
    mostraSfondo(t, s.extra === 'caos' ? 1 : s.extra === 'reveal' ? 1 - ease(tl / 1.4) : 0);
    // finestra: nascosta nel caos, cresce nel reveal, si rimpicciolisce nel finale
    let fs = 1, fo = 1, fy = 0;
    if (s.extra === 'caos') { fo = 0; mostraCaos(tl, 'caos'); }
    else if (s.extra === 'reveal') { mostraCaos(tl, 'reveal'); const k = ease((tl - 0.35) / 1.2); fs = mix(0.2, 1, k); fo = lin((tl - 0.35) / 0.4); }
    else if (s.extra === 'macchine') { const k = ease((tl - 2.4) / 0.9); fs = mix(1, 0.52, k); fy = mix(0, 25, k); }
    else if (s.extra === 'finale') { const k = ease(tl / 1.2); fs = mix(1, 0.6, k); fy = mix(0, 60, k); fo = 1 - k; }
    fin.style.opacity = fo; fin.style.transform = `translateY(${fy}px) scale(${fs})`;
    mostraRiprese(s.extra === 'finale' ? { riprese: [{ img: 'cruscotto', cam: [[0, 0, 0, 1]] }], dur: 99 } : s, tl);

    // capitolo in alto a sinistra
    if (s.capitolo) { cap.innerHTML = `<b>${s.capitolo[0]}</b>${s.capitolo[1]}`; cap.style.opacity = Math.min(lin(tl / 0.4), lin((s.dur - tl) / 0.3)); cap.style.transform = `translateX(${(1 - ease(tl / 0.5)) * -30}px)`; }
    else cap.style.opacity = 0;
    const st = sottotitolo(s, tl); sott.textContent = st; sott.style.opacity = st ? 1 : 0;

    // testi grandi e badge
    if (s.extra === 'caos') {
      const k = lin((tl - tDieci) / 0.4);
      extra.innerHTML = `<div class="grande" style="top:430px;font-size:92px;opacity:${k};transform:scale(${mix(1.2, 1, ease(k))});text-shadow:0 10px 40px #000">10 programmi diversi.</div>`;
    }
    if (s.extra === 'reveal') {
      const k = lin((tl - 1.6) / 0.5);
      // scritta grande finché la voce fa la domanda, poi i sottotitoli (documenti, produzione, qualità, sicurezza)
      extra.innerHTML = `<div class="grande" style="top:${mix(990, 960, ease(k))}px;font-size:46px;opacity:${k * (1 - lin((tl - 4.1) / 0.3))}">Un solo portale. <span style="color:var(--accento)">Tutta l'azienda.</span></div>`;
      if (tl < 4.3) sott.style.opacity = 0;
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
    if (s.extra === 'macchine') extra.innerHTML = macchine(tl);
    if (s.extra === 'finale') {
      const a = lin((tl - 0.6) / 0.5), b = lin((tl - 2.4) / 0.5), c = lin((tl - 4.0) / 0.5);  // pulsante "Richiedi una demo" tolto (Adriano 12/11/2026)
      extra.innerHTML = `<div class="grande" style="top:300px;font-size:96px;opacity:${a};transform:translateY(${(1 - ease(a)) * 20}px)">Dalla email alla fattura.</div>
        <div class="grande" style="top:440px;font-size:52px;font-weight:600;color:var(--tenue);opacity:${b}">Un solo portale. <span style="color:var(--accento)">Semplice. Completo.</span></div>
        <div class="grande" style="top:620px;font-size:30px;font-weight:500;color:var(--tenue);opacity:${c}">Il gestionale con intelligenza artificiale per chi produce elettronica</div>`;
    }
  };
})();
