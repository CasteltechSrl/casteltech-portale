// Preventivi → Da documenti: caricamento del pacchetto (file, zip o cartella), disegno del Gerber, filtri della tabella componenti.
(() => {
  // ── caricamento: si crea il pacchetto, il portale sceglie dai nomi i file utili (PDF, 3D, immagini, file troppo grandi restano
  //    sul Drive, solo il nome: regola in src/engine/scheda/scelta-file.ts), si mandano quelli uno alla volta (4 insieme), poi l'analisi ──
  const invia = document.getElementById('invia-pacchetto');
  if (invia) invia.addEventListener('click', async () => {
    const esito = document.getElementById('esito-pacchetto');
    const scelti = [...document.getElementById('file-pacchetto').files, ...document.getElementById('cartella-pacchetto').files];
    if (!scelti.length) { esito.textContent = 'Scegli prima i file o la cartella.'; return; }
    const percorso = f => f.webkitRelativePath || f.name;
    // dalla cartella si toglie il primo livello (il nome della cartella), che diventa il nome del pacchetto se non è scritto
    const cartella = scelti.find(f => f.webkitRelativePath)?.webkitRelativePath.split('/')[0];
    const nome = document.getElementById('nome-pacchetto').value.trim() || cartella || scelti[0].name.replace(/\.[^.]+$/, '');
    const file = scelti.filter(f => !/(^|\/)(desktop\.ini|thumbs\.db|\.ds_store)$/i.test(percorso(f)));
    invia.disabled = true;
    try {
      const r = await fetch('/preventivi/documenti/nuovo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cliente: document.getElementById('cliente-pacchetto').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.errore || 'Errore nella creazione del pacchetto');
      const nomeIn = f => cartella && f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : percorso(f);
      esito.textContent = 'Scelta dei file utili…';
      const rs = await fetch(`/preventivi/documenti/${j.id}/scelta`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: file.map(f => ({ nome: nomeIn(f), byte: f.size })) }) });
      const js = await rs.json().catch(() => ({}));
      if (!rs.ok) throw new Error(js.errore || 'Scelta dei file non riuscita');
      const daMandare = new Set(js.carica);
      const utili = file.filter(f => daMandare.has(nomeIn(f)));
      const mb = n => (n / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
      const lasciati = js.soloElenco.length
        ? ` (${js.soloElenco.length} restano sul Drive, solo il nome: ${mb(js.soloElenco.reduce((t, f) => t + f.byte, 0))} di PDF, 3D, immagini e simili)` : '';
      let fatti = 0;
      const coda = [...utili];
      const lavora = async () => {
        for (let f = coda.shift(); f; f = coda.shift()) {
          const p = nomeIn(f);
          const rf = await fetch(`/preventivi/documenti/${j.id}/file?nome=${encodeURIComponent(p)}`, { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
          if (!rf.ok) { const e = await rf.json().catch(() => ({})); throw new Error(`${p}: ${e.errore || 'file non caricato (troppo grande?)'}`); }
          esito.textContent = `Caricamento dei file utili: ${++fatti} di ${utili.length}${lasciati}…`;
        }
      };
      await Promise.all([lavora(), lavora(), lavora(), lavora()]);
      esito.textContent = 'Analisi dei file…';
      const ra = await fetch(`/preventivi/documenti/${j.id}/analizza`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const ja = await ra.json().catch(() => ({}));
      if (!ra.ok) throw new Error(ja.errore || 'Analisi non riuscita');
      location.href = `/preventivi/documenti/${j.id}`;
    } catch (e) { esito.textContent = e.message; invia.disabled = false; }
  });

  // ── tabella componenti: filtri, ricerca, riga evidenziata ──
  const tabella = document.getElementById('tabella-componenti');
  const filtri = document.getElementById('filtri-componenti');
  const cerca = document.getElementById('cerca-componente');
  let filtro = '';
  const applica = () => {
    const parole = (cerca?.value || '').toUpperCase().split(/\s+/).filter(Boolean);
    tabella?.querySelectorAll('tbody tr').forEach(tr => {
      const okFiltro = !filtro || tr.dataset.classi.split(' ').includes(filtro);
      const testo = tr.dataset.cerca.toUpperCase();
      tr.hidden = !(okFiltro && parole.every(p => testo.includes(p)));
    });
  };
  filtri?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filtri.querySelectorAll('button').forEach(x => x.classList.toggle('attivo', x === b));
    filtro = b.dataset.filtro; applica();
  });
  cerca?.addEventListener('input', applica);
  const evidenzia = ref => {
    const tr = tabella?.querySelector(`tr[data-ref="${CSS.escape(ref)}"]`);
    tabella?.querySelectorAll('tr.evidenziata').forEach(x => x.classList.remove('evidenziata'));
    if (tr) { tr.hidden = false; tr.classList.add('evidenziata'); tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    visore?.evidenzia(ref);
  };
  document.addEventListener('click', e => { const b = e.target.closest('button.rif'); if (b) evidenzia(b.dataset.ref); });
  tabella?.addEventListener('click', e => { const tr = e.target.closest('tbody tr'); if (tr) visore?.evidenzia(tr.dataset.ref, true); });

  // ── disegno del Gerber ──
  const box = document.getElementById('visore');
  let visore = null;
  if (box) visore = avviaVisore(box, evidenzia);

  function avviaVisore(box, suClic) {
    const NS = 'http://www.w3.org/2000/svg';
    const area = document.getElementById('visore-area');
    const elencoStrati = document.getElementById('strati');
    const NOMI = { rame: 'rame', maschera: 'maschera', pasta: 'pasta', serigrafia: 'serigrafia', contorno: 'contorno', interno: 'interno', foratura: 'dis. forature', altro: 'altro' };
    let vista = 'TOP', vb = null, tutto = null, svg, mondo, gruppoComp, gruppoFori, gruppoProt, strati = [], componenti = [], forature = [];
    // protezioni per la saldatura a onda: fori e zone segnate dall'ufficio
    let modoProt = false, prot = { fori: [], zone: [] }, modificate = false;
    // visibili all'inizio: contorno, rame e serigrafia del lato guardato (il primo file per tipo: es. Altium ha anche l'Assembly)
    const visibiliPredefiniti = (s, lato) => {
      const primo = strati.find(x => x.ruolo === s.ruolo && x.lato === s.lato) === s;
      return primo && (s.ruolo === 'contorno' || (['rame', 'serigrafia'].includes(s.ruolo) && (s.lato === lato || (!s.lato && s.ruolo === 'rame' && strati.filter(x => x.ruolo === 'rame').length === 1))));
    };
    const DISEGNO = ['interno', 'rame', 'maschera', 'pasta', 'serigrafia', 'foratura', 'altro', 'contorno'];
    const ORDINE = ['contorno', 'rame', 'maschera', 'pasta', 'serigrafia', 'interno', 'foratura', 'altro'];

    Promise.all([fetch(`/preventivi/documenti/${box.dataset.id}/disegno`).then(r => r.ok ? r.json() : null), fetch(`/preventivi/documenti/${box.dataset.id}/componenti`).then(r => r.json())])
      .then(([d, c]) => {
        if (!d || !d.strati.length) { area.innerHTML = '<p class="nota">Nessun file Gerber nel pacchetto.</p>'; return; }
        componenti = c; disegna(d);
      }).catch(() => { area.innerHTML = '<p class="nota">Disegno non disponibile.</p>'; });

    function disegna(d) {
      // nell'elenco: prima il lato TOP, poi il BOT, poi il resto, ciascuno nell'ordine dei tipi
      const peso = x => ({ TOP: 0, BOT: 1 }[x.lato] ?? (x.ruolo === 'contorno' ? -1 : 2)) * 100 + ORDINE.indexOf(x.ruolo);
      strati = d.strati.map((x, i) => ({ ...x, i })).sort((a, b) => peso(a) - peso(b));
      const r = d.riquadro || d.strati.find(s => s.riquadro)?.riquadro;
      if (!r) { area.innerHTML = '<p class="nota">Disegno vuoto.</p>'; return; }
      const m = Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.04;
      tutto = { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m };
      const raggioSegno = Math.min(0.7, Math.max(0.15, Math.hypot(r.x1 - r.x0, r.y1 - r.y0) * 0.005));
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'pcb');
      // il contenuto viene dal lettore Gerber del portale (solo numeri e forme), non da testo del cliente
      svg.innerHTML = `<defs>${d.strati.map(s => s.defs).join('')}</defs><rect class="fondo" x="-1e5" y="-1e5" width="2e5" height="2e5"/><g class="mondo">${
        // ordine di disegno: sotto il rame, sopra maschera, pasta, serigrafia e per ultimo il contorno
        [...strati].sort((a, b) => DISEGNO.indexOf(a.ruolo) - DISEGNO.indexOf(b.ruolo))
          .map(s => `<g class="strato ruolo-${s.ruolo} lato-${s.lato || 'nessuno'}" data-i="${s.i}" fill="currentColor">${s.corpo}</g>`).join('')
      }<g class="fori"></g><g class="protezioni"></g><g class="segni"></g></g>`;
      mondo = svg.querySelector('.mondo'); gruppoFori = svg.querySelector('.fori'); gruppoComp = svg.querySelector('.segni'); gruppoProt = svg.querySelector('.protezioni');
      forature = d.forature || [];
      for (const f of d.forature || []) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', f.x); c.setAttribute('cy', f.y); c.setAttribute('r', Math.max(f.d / 2, 0.05));
        if (f.metallizzato === false) c.setAttribute('class', 'npth');
        gruppoFori.appendChild(c);
      }
      for (const k of componenti) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', k.x); c.setAttribute('cy', k.y); c.setAttribute('r', raggioSegno);
        c.setAttribute('class', `segno lato-${k.lato || 'TOP'} ${k.tipo}${k.segnalato ? ' segnalato' : ''}`);
        c.dataset.ref = k.ref;
        const t = document.createElementNS(NS, 'title'); t.textContent = `${k.ref} · ${k.tipo} ${k.lato || ''} · rot ${k.rot}°`; c.appendChild(t);
        gruppoComp.appendChild(c);
      }
      area.innerHTML = ''; area.appendChild(svg);
      elencoStrati.innerHTML = '';
      strati.forEach((s, k) => {
        const l = document.createElement('label'); l.className = `spunta piccola strato-${s.ruolo}`;
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.k = k;
        cb.addEventListener('change', () => svg.querySelector(`g.strato[data-i="${s.i}"]`).classList.toggle('nascosto', !cb.checked));
        const uguali = strati.filter(x => x.ruolo === s.ruolo && x.lato === s.lato), n = uguali.length > 1 ? ` (${uguali.indexOf(s) + 1})` : '';
        l.title = s.nome; l.append(cb, ` ${NOMI[s.ruolo] || s.ruolo}${s.lato ? ' ' + s.lato : ''}${n}`);
        elencoStrati.appendChild(l);
      });
      impostaVista('TOP');
      // zoom con la rotellina, spostamento trascinando
      svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.8 : 1.25, e); }, { passive: false });
      let presa = null;
      svg.addEventListener('pointerdown', e => {
        presa = { x: e.clientX, y: e.clientY, vb: { ...vb }, mosso: false, inizio: modoProt ? nelDisegno(e) : null };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', e => {
        if (!presa) return;
        if (modoProt) { // si disegna la zona invece di spostare il disegno
          if (Math.abs(e.clientX - presa.x) + Math.abs(e.clientY - presa.y) > 4) presa.mosso = true;
          if (presa.mosso) { presa.fine = nelDisegno(e); disegnaProtezioni(zonaDa(presa.inizio, presa.fine)); }
          return;
        }
        const s = vb.w / svg.clientWidth, dx = (e.clientX - presa.x) * s, dy = (e.clientY - presa.y) * s;
        if (Math.abs(dx) + Math.abs(dy) > s * 3) presa.mosso = true;
        vb = { ...presa.vb, x: presa.vb.x - dx, y: presa.vb.y - dy }; applicaVb();
      });
      svg.addEventListener('pointerup', e => {
        const era = presa; presa = null;
        if (era && modoProt) { cliccaProtezioni(era, e); return; }
        if (era && !era.mosso) { const el = document.elementFromPoint(e.clientX, e.clientY); if (el?.dataset?.ref) suClic(el.dataset.ref); }
      });
      const bottoneProt = document.getElementById('modo-protezioni'), salvaProt = document.getElementById('salva-protezioni');
      if (bottoneProt) {
        fetch(`/preventivi/documenti/${box.dataset.id}/protezioni`).then(r => r.json()).then(p => { prot = { fori: p.fori || [], zone: p.zone || [] }; disegnaProtezioni(); }).catch(() => {});
        bottoneProt.addEventListener('click', () => {
          modoProt = !modoProt;
          bottoneProt.classList.toggle('attivo', modoProt);
          salvaProt.hidden = !modoProt && !modificate;
          svg.classList.toggle('modo-protezioni', modoProt);
          if (modoProt) {
            impostaVista(box.dataset.latoSaldature || 'BOT');
            info(`Lato saldature (${vista}). Clic su un foro per proteggerlo o toglierlo; trascina per segnare una zona; clic dentro una zona per toglierla. Poi «Salva protezioni».`);
          } else info('Rotellina per ingrandire, trascina per spostare. Clic su un componente per vederlo nella tabella.');
        });
        salvaProt.addEventListener('click', async () => {
          salvaProt.disabled = true;
          const r = await fetch(`/preventivi/documenti/${box.dataset.id}/protezioni`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prot) });
          const j = await r.json().catch(() => ({}));
          salvaProt.disabled = false;
          if (r.ok) { modificate = false; info(`Salvate: ${j.fori} fori e ${j.zone} zone. Si stampano con «Protezioni per la saldatura a onda».`); }
          else info(j.errore || 'Salvataggio non riuscito');
        });
      }
      document.getElementById('mostra-componenti').addEventListener('change', e => gruppoComp.classList.toggle('nascosto', !e.target.checked));
      document.getElementById('mostra-fori').addEventListener('change', e => gruppoFori.classList.toggle('nascosto', !e.target.checked));
      document.getElementById('zoom-piu').addEventListener('click', () => zoom(0.7));
      document.getElementById('zoom-meno').addEventListener('click', () => zoom(1.4));
      document.getElementById('zoom-tutto').addEventListener('click', adatta);
      box.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => impostaVista(b.dataset.vista)));
    }

    function info(t) { document.getElementById('visore-info').textContent = t; }
    // punto del mouse nelle coordinate della scheda (mm, come il Gerber)
    function nelDisegno(e) {
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(mondo.getScreenCTM().inverse());
      return { x: q.x, y: q.y };
    }
    const zonaDa = (a, b) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
    const arrotonda = n => Math.round(n * 1000) / 1000;
    function cliccaProtezioni(era, e) {
      if (era.mosso && era.inizio && era.fine) {
        const z = zonaDa(era.inizio, era.fine);
        if (z.x1 - z.x0 > 0.3 && z.y1 - z.y0 > 0.3) prot.zone.push({ x0: arrotonda(z.x0), y0: arrotonda(z.y0), x1: arrotonda(z.x1), y1: arrotonda(z.y1) });
      } else {
        const p = nelDisegno(e);
        const i = prot.fori.findIndex(f => Math.hypot(f.x - p.x, f.y - p.y) < Math.max(f.d / 2, 0.6));
        if (i >= 0) prot.fori.splice(i, 1);
        else {
          const foro = forature.filter(f => f.metallizzato !== false && Math.hypot(f.x - p.x, f.y - p.y) < Math.max(f.d / 2, 0.6))
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
          const z = prot.zone.findIndex(z => p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1);
          if (foro) prot.fori.push({ x: arrotonda(foro.x), y: arrotonda(foro.y), d: arrotonda(foro.d) });
          else if (z >= 0) prot.zone.splice(z, 1);
          else return;
        }
      }
      modificate = true; document.getElementById('salva-protezioni').hidden = false;
      disegnaProtezioni();
      info(`${prot.fori.length} fori e ${prot.zone.length} zone da proteggere (non ancora salvate).`);
    }
    function disegnaProtezioni(provvisoria) {
      if (!gruppoProt) return;
      gruppoProt.innerHTML = '';
      const r = Math.max(0.25, (tutto.x1 - tutto.x0) * 0.003);
      for (const f of prot.fori) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', f.x); c.setAttribute('cy', f.y); c.setAttribute('r', Math.max(f.d / 2, 0.3) + r);
        c.setAttribute('class', 'prot-foro'); gruppoProt.appendChild(c);
      }
      for (const z of [...prot.zone, ...(provvisoria ? [provvisoria] : [])]) {
        const q = document.createElementNS(NS, 'rect');
        q.setAttribute('x', z.x0); q.setAttribute('y', z.y0); q.setAttribute('width', z.x1 - z.x0); q.setAttribute('height', z.y1 - z.y0);
        q.setAttribute('class', 'prot-zona'); gruppoProt.appendChild(q);
      }
    }

    // TOP: si guarda da sopra (y del Gerber verso l'alto); BOT: da sotto, quindi specchiato a destra/sinistra
    function impostaVista(v) {
      vista = v;
      box.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('attivo', b.dataset.vista === v));
      mondo.setAttribute('transform', v === 'BOT' ? 'scale(-1,-1)' : 'scale(1,-1)');
      svg.classList.toggle('vista-bot', v === 'BOT');
      elencoStrati.querySelectorAll('input').forEach(cb => {
        const s = strati[cb.dataset.k]; cb.checked = visibiliPredefiniti(s, v);
        svg.querySelector(`g.strato[data-i="${s.i}"]`).classList.toggle('nascosto', !cb.checked);
      });
      adatta();
    }
    function adatta() {
      const w = tutto.x1 - tutto.x0, h = tutto.y1 - tutto.y0;
      vb = { x: vista === 'BOT' ? -tutto.x1 : tutto.x0, y: -tutto.y1, w, h };
      svg.style.aspectRatio = `${w} / ${h}`;
      applicaVb();
    }
    function applicaVb() { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
    function zoom(f, e) {
      const rc = svg.getBoundingClientRect();
      const px = e ? (e.clientX - rc.left) / rc.width : 0.5, py = e ? (e.clientY - rc.top) / rc.height : 0.5;
      const nw = vb.w * f, nh = vb.h * f;
      vb = { x: vb.x + (vb.w - nw) * px, y: vb.y + (vb.h - nh) * py, w: nw, h: nh }; applicaVb();
    }
    return {
      evidenzia(ref, centra) {
        if (!svg) return;
        gruppoComp.querySelectorAll('.scelto').forEach(x => x.classList.remove('scelto'));
        const c = gruppoComp.querySelector(`[data-ref="${CSS.escape(ref)}"]`);
        if (!c) return;
        c.classList.add('scelto');
        const k = componenti.find(x => x.ref === ref);
        if (k && k.lato && k.lato !== vista && k.tipo !== 'THT') impostaVista(k.lato);
        if (centra && k) {
          const w = Math.min(vb.w, 30), h = w * vb.h / vb.w, x = vista === 'BOT' ? -k.x : k.x;
          vb = { x: x - w / 2, y: -k.y - h / 2, w, h }; applicaVb();
          box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      },
    };
  }
})();
