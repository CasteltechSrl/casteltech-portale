// Caselle con un elenco di scelte (Adriano 4/11/2026, causale del trasporto nel DDT): il menu del browser (datalist) mostrava
// solo le voci che cominciano come il testo già scritto, quindi con "RESO LAVORATO" nella casella la freccia non proponeva le altre causali.
// Qui ogni <input list="…"> del portale diventa una casella con il SUO elenco: clic o freccia giù = tutte le voci, scrivendo si filtra,
// clic / Invio sceglie, Esc chiude. Si può sempre scrivere un testo libero. Il <datalist> resta nella pagina (altri script lo leggono).
(function () {
  const norm = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Voci da mostrare: tutte se la casella è vuota, se "tutte" è chiesto (clic, freccia) o se il testo è già una delle voci;
  // altrimenti quelle che contengono tutte le parole scritte (in qualunque punto).
  function vociDaMostrare(voci, testo, tutte) {
    const t = norm(testo);
    if (tutte || !t || voci.some(v => norm(v.valore) === t)) return voci.slice();
    const parole = t.split(' ');
    return voci.filter(v => { const x = norm(v.valore + ' ' + (v.etichetta ?? '')); return parole.every(p => x.includes(p)); });
  }
  if (typeof window !== 'undefined') window.elenchiScelta = { vociDaMostrare };
  if (typeof document === 'undefined') return;

  let elenco = null, casella = null, attivo = -1;
  const chiudi = () => { elenco?.remove(); elenco = null; casella = null; attivo = -1; };
  const vociDi = inp => {
    const dl = document.getElementById(inp.dataset.elenco);
    return dl ? [...dl.querySelectorAll('option')].map(o => ({ valore: o.value, etichetta: o.textContent.trim() !== o.value ? o.textContent.trim() : '' })) : [];
  };
  function evidenzia(n) {
    const li = elenco ? [...elenco.querySelectorAll('li.voce')] : [];
    if (!li.length) return;
    attivo = (n + li.length) % li.length;
    li.forEach((v, i) => v.classList.toggle('attiva', i === attivo));
    li[attivo].scrollIntoView({ block: 'nearest' });
  }
  function scegli(inp, valore) {
    inp.value = inp.classList.contains('maiuscolo') ? valore.toUpperCase() : valore;
    chiudi();
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));   // salvataggio automatico delle bozze, km della nota spese…
  }
  function apri(inp, tutte) {
    const voci = vociDaMostrare(vociDi(inp), inp.value, tutte);
    chiudi();
    if (!voci.length) return;
    casella = inp;
    elenco = document.createElement('ul');
    elenco.className = 'elenco-trovati elenco-scelta';
    for (const v of voci) {
      const li = document.createElement('li');
      li.className = 'voce';
      li.textContent = v.valore;
      if (v.etichetta) { const s = document.createElement('span'); s.className = 'nota'; s.textContent = '  ' + v.etichetta; li.appendChild(s); }
      li.addEventListener('mousedown', ev => { ev.preventDefault(); scegli(inp, v.valore); });
      elenco.appendChild(li);
    }
    const r = inp.getBoundingClientRect();
    Object.assign(elenco.style, { left: `${r.left + window.scrollX}px`, top: `${r.bottom + window.scrollY}px`, minWidth: `${Math.max(r.width, 160)}px` });
    document.body.appendChild(elenco);
    const uguale = voci.findIndex(v => norm(v.valore) === norm(inp.value));
    evidenzia(uguale >= 0 ? uguale : 0);
  }
  // toglie il menu del browser e aggancia il nostro (anche alle righe aggiunte dopo: si fa al primo contatto)
  function prepara(inp) {
    if (inp.dataset.elenco || !inp.getAttribute('list')) return;
    inp.dataset.elenco = inp.getAttribute('list');
    inp.removeAttribute('list');
    inp.setAttribute('autocomplete', 'off');
    inp.classList.add('con-elenco');
    inp.title ||= 'Clicca per l\'elenco, oppure scrivi';
  }
  const preparaTutte = () => document.querySelectorAll('input[list]').forEach(prepara);
  preparaTutte();
  document.addEventListener('pointerdown', e => { if (e.target.matches?.('input[list]')) prepara(e.target); }, true);
  document.addEventListener('focusin', e => { if (e.target.matches?.('input[list]')) prepara(e.target); }, true);
  new MutationObserver(preparaTutte).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', e => {
    const inp = e.target;
    if (!inp.dataset?.elenco || inp.readOnly || inp.disabled) return;
    if (casella === inp) chiudi(); else apri(inp, true);
  });
  document.addEventListener('input', e => {
    const inp = e.target;
    if (!inp.dataset?.elenco || !e.isTrusted) return;
    apri(inp, false);
  });
  document.addEventListener('keydown', e => {
    const inp = e.target;
    if (!inp.dataset?.elenco || inp.readOnly || inp.disabled) return;
    if (!elenco || casella !== inp) {
      if (e.key === 'ArrowDown') { e.preventDefault(); apri(inp, true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); evidenzia(attivo + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); evidenzia(attivo - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); chiudi(); }
    else if (e.key === 'Enter') {   // Invio sceglie la voce evidenziata (non manda il modulo)
      e.preventDefault();
      elenco.querySelectorAll('li.voce')[attivo]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    } else if (e.key === 'Tab') chiudi();
  });
  document.addEventListener('focusout', e => {
    if (e.target === casella) setTimeout(() => { if (document.activeElement !== casella) chiudi(); }, 150);
  });
  window.addEventListener('resize', chiudi);
})();
