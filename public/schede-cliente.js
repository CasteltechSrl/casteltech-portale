// Preventivi → Da documenti: caricamento del pacchetto (file, zip o cartella), disegno del Gerber, filtri della tabella componenti.
(() => {
  // ── caricamento: si crea il pacchetto, si mandano i file uno alla volta (4 insieme), poi si chiede l'analisi ──
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
      let fatti = 0;
      const coda = [...file];
      const lavora = async () => {
        for (let f = coda.shift(); f; f = coda.shift()) {
          const p = cartella && f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : percorso(f);
          const rf = await fetch(`/preventivi/documenti/${j.id}/file?nome=${encodeURIComponent(p)}`, { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
          if (!rf.ok) { const e = await rf.json().catch(() => ({})); throw new Error(`${p}: ${e.errore || 'file non caricato (troppo grande?)'}`); }
          esito.textContent = `Caricamento ${++fatti} di ${file.length}…`;
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
    let vista = 'TOP', vb = null, tutto = null, svg, mondo, gruppoComp, gruppoFori, strati = [], componenti = [];
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
      }<g class="fori"></g><g class="segni"></g></g>`;
      mondo = svg.querySelector('.mondo'); gruppoFori = svg.querySelector('.fori'); gruppoComp = svg.querySelector('.segni');
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
      svg.addEventListener('pointerdown', e => { presa = { x: e.clientX, y: e.clientY, vb: { ...vb }, mosso: false }; svg.setPointerCapture(e.pointerId); });
      svg.addEventListener('pointermove', e => {
        if (!presa) return;
        const s = vb.w / svg.clientWidth, dx = (e.clientX - presa.x) * s, dy = (e.clientY - presa.y) * s;
        if (Math.abs(dx) + Math.abs(dy) > s * 3) presa.mosso = true;
        vb = { ...presa.vb, x: presa.vb.x - dx, y: presa.vb.y - dy }; applicaVb();
      });
      svg.addEventListener('pointerup', e => {
        const era = presa; presa = null;
        if (era && !era.mosso) { const el = document.elementFromPoint(e.clientX, e.clientY); if (el?.dataset?.ref) suClic(el.dataset.ref); }
      });
      document.getElementById('mostra-componenti').addEventListener('change', e => gruppoComp.classList.toggle('nascosto', !e.target.checked));
      document.getElementById('mostra-fori').addEventListener('change', e => gruppoFori.classList.toggle('nascosto', !e.target.checked));
      document.getElementById('zoom-piu').addEventListener('click', () => zoom(0.7));
      document.getElementById('zoom-meno').addEventListener('click', () => zoom(1.4));
      document.getElementById('zoom-tutto').addEventListener('click', adatta);
      box.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => impostaVista(b.dataset.vista)));
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
