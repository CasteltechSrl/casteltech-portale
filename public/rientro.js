// Rientro scheda: aggiungi/togli righe del foglio tempi, totale calcolato da apertura e chiusura.
(() => {
  const form = document.getElementById('rientro');
  const corpo = document.querySelector('#tabella-righe tbody');
  const modello = document.getElementById('modello-riga');
  let prossimo = corpo.querySelectorAll('tr').length + 100;
  let modificato = false;

  const numeraRighe = () => corpo.querySelectorAll('tr').forEach((tr, i) => { const c = tr.querySelector('.num-riga'); if (c) c.textContent = i + 1; });

  document.getElementById('aggiungi-riga').addEventListener('click', () => {
    const ultima = corpo.querySelector('tr:last-child');
    const nuova = modello.innerHTML.replaceAll('__N__', String(prossimo++));
    corpo.insertAdjacentHTML('beforeend', nuova);
    const tr = corpo.querySelector('tr:last-child');
    // data e operatore come la riga sopra (di solito sono uguali)
    if (ultima) for (const campo of ['data', 'operatore']) {
      const da = ultima.querySelector(`[name$="[${campo}]"]`), a = tr.querySelector(`[name$="[${campo}]"]`);
      if (da && a && da.value) a.value = da.value;
    }
    numeraRighe();
    tr.querySelector('select').focus();
  });

  corpo.addEventListener('click', e => {
    if (!e.target.classList.contains('togli-riga')) return;
    e.target.closest('tr').remove();
    numeraRighe();
    modificato = true;
  });

  // totale suggerito da apertura e chiusura
  const minuti = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  corpo.addEventListener('change', e => {
    const tr = e.target.closest('tr');
    if (!tr || !/\[(apertura|chiusura)\]$/.test(e.target.name)) return;
    const a = minuti(tr.querySelector('[name$="[apertura]"]').value), c = minuti(tr.querySelector('[name$="[chiusura]"]').value);
    const tot = tr.querySelector('[data-totale]');
    if (a == null || c == null) { tot.placeholder = 'h:mm'; return; }
    const d = (c - a + 1440) % 1440;
    tot.placeholder = `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`;
  });

  form.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => {
    const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
  }));
  corpo.addEventListener('input', e => { if (e.target.classList.contains('maiuscolo')) { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); } });
  form.addEventListener('input', () => { modificato = true; });
  form.addEventListener('submit', () => { modificato = false; });
  window.addEventListener('beforeunload', e => { if (modificato) e.preventDefault(); });
  // Invio non invia il modulo: passa al campo successivo
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const campi = [...form.querySelectorAll('input, select, textarea')].filter(x => x.offsetParent && x.type !== 'hidden');
    const i = campi.indexOf(e.target);
    if (campi[i + 1]) campi[i + 1].focus();
  });
})();
