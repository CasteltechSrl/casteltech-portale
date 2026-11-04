// Attributi avanzati della fattura elettronica (src/server/views/attributi-fattura.ts): la spunta accende la casella del valore
// (le caselle spente non si mandano al salvataggio), clic sulla casella spenta = spunta; ricerca che mostra i campi trovati con i loro blocchi.
(() => {
  for (const tabella of document.querySelectorAll('.albero-attributi')) {
    const accendi = (riga, si) => {
      const spunta = riga.querySelector('.attr-spunta'), valore = riga.querySelector('.attr-valore');
      if (!spunta || !valore) return;
      spunta.checked = si; valore.disabled = !si;
      if (si) valore.focus();
      valore.form?.dispatchEvent(new Event('change', { bubbles: true }));
    };
    tabella.addEventListener('change', e => { if (e.target.classList.contains('attr-spunta')) accendi(e.target.closest('tr'), e.target.checked); });
    tabella.addEventListener('click', e => {
      const td = e.target.closest('td');
      const riga = td?.closest('tr.foglia');
      if (!riga || e.target.classList.contains('attr-spunta')) return;
      const valore = riga.querySelector('.attr-valore');
      if (valore?.disabled) accendi(riga, true);
    });
    const cerca = tabella.closest('details')?.querySelector('.cerca-attributi');
    cerca?.addEventListener('input', () => {
      const parole = cerca.value.toLowerCase().split(/\s+/).filter(Boolean);
      const righe = [...tabella.querySelectorAll('tr[data-chiave]')];
      if (!parole.length) { righe.forEach(r => { r.hidden = false; }); return; }
      const trovate = righe.filter(r => parole.every(p => r.dataset.cerca.includes(p))).map(r => r.dataset.chiave);
      righe.forEach(r => {
        const k = r.dataset.chiave;
        // visibile se trovata, se è un blocco che contiene una trovata, o se sta dentro un blocco trovato
        r.hidden = !trovate.some(t => t === k || t.startsWith(`${k}.`) || k.startsWith(`${t}.`));
      });
    });
  }
})();
