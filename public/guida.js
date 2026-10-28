// Guida del portale: risultati mentre si scrive (/guida/cerca) e domande all'IA (/guida/chiedi).
// I testi arrivano dal server e si inseriscono come testo, mai come HTML.
(() => {
  const el = (tag, cls, testo) => { const e = document.createElement(tag); if (cls) e.className = cls; if (testo != null) e.textContent = testo; return e; };
  const link = (href, testo) => { const a = el('a', null, testo); a.href = href; return a; };

  // ── ricerca mentre si scrive ──
  const casella = document.querySelector('input[data-cerca-guida]');
  const box = document.getElementById('risultati-guida');
  if (casella && box) {
    let timer, ultima = '';
    const mostra = (q, ris) => {
      box.replaceChildren();
      if (!q) return;
      if (!ris.length) { box.append(el('p', 'nota', `Nessun argomento per «${q}»: prova con altre parole.`)); return; }
      const ol = el('ol', 'elenco-risultati');
      for (const r of ris) {
        const li = el('li');
        const a = link(r.href, ''); a.append(el('strong', null, r.titolo));
        li.append(a, ' ', el('span', 'etichetta', r.area), el('div', 'nota', r.testo));
        ol.append(li);
      }
      box.append(ol);
    };
    casella.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = casella.value.trim();
        if (q === ultima) return;
        ultima = q;
        if (!q) return mostra('', []);
        try {
          const r = await fetch('/guida/cerca?q=' + encodeURIComponent(q), { headers: { accept: 'application/json' } });
          if (r.ok && casella.value.trim() === q) mostra(q, await r.json());
        } catch { /* senza rete resta il pulsante Cerca */ }
      }, 200);
    });
    casella.addEventListener('keydown', e => { if (e.key === 'Escape') { casella.value = ''; ultima = ''; mostra('', []); } });
  }

  // ── domande all'IA ──
  const modulo = document.getElementById('chiedi-guida');
  const conv = document.getElementById('conversazione-guida');
  if (modulo && conv) {
    modulo.addEventListener('submit', async e => {
      e.preventDefault();
      const campo = modulo.elements.domanda, pulsante = modulo.querySelector('button');
      const domanda = campo.value.trim();
      if (!domanda) return;
      conv.append(el('div', 'msg-guida domanda', domanda));
      const risposta = el('div', 'msg-guida risposta', 'Sto cercando nella guida…');
      conv.append(risposta);
      campo.value = ''; pulsante.disabled = true;
      try {
        const r = await fetch('/guida/chiedi', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ domanda }) });
        const d = await r.json();
        risposta.textContent = d.risposta ?? d.errore ?? 'Nessuna risposta.';
        if (d.argomenti?.length) {
          const vai = el('div', 'vai-guida');
          for (const a of d.argomenti) { const b = link(a.href, a.titolo + ' →'); b.className = 'bottone'; vai.append(b, ' '); }
          risposta.append(vai);
        }
      } catch {
        risposta.textContent = 'Non riesco a raggiungere il portale: controlla la connessione e riprova.';
      } finally { pulsante.disabled = false; campo.focus(); risposta.scrollIntoView({ block: 'nearest' }); }
    });
  }
})();
