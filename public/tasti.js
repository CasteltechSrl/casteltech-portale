// Tasti rapidi in tutto il portale (1/11/2026). Oltre a "/" e Ctrl+K (ricerca, cerca.js) e Ctrl+S (Salva nelle bozze, autosalva.js):
// - Alt+N: il pulsante "+ Nuovo…" della pagina (nuovo preventivo, nuova fattura, nuovo DDT, nuovo fornitore…);
// - Esc: chiude la finestra dei tasti e toglie il cursore dalla casella di ricerca;
// - ? (Shift+7 sulla tastiera italiana, fuori dalle caselle): mostra l'elenco dei tasti rapidi.
(() => {
  const inCasella = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  const nuovo = () => [...document.querySelectorAll('main a.bottone, main button')].find(b => /^\+\s/.test(b.textContent.trim()) && !b.disabled && b.offsetParent !== null);
  let pannello = null;
  const chiudi = () => { if (pannello) { pannello.remove(); pannello = null; } };
  const apri = () => {
    chiudi();
    const voci = [['/', 'Cerca in tutto il portale (anche Ctrl+K)'], ['Alt+N', 'Nuovo: preventivo, fattura, DDT, fornitore… (il pulsante "+" della pagina)'],
      ['Ctrl+S', 'Salva la bozza che stai scrivendo (si salva comunque da sola dopo 2 secondi)'], ['Frecce + Invio', 'Nella ricerca in alto: scegli e apri la voce'],
      ['Esc', 'Chiude le tendine e questa finestra'], ['?', 'Questa finestra']];
    pannello = document.createElement('div');
    pannello.className = 'pannello-tasti';
    pannello.setAttribute('role', 'dialog');
    const h = document.createElement('h2'); h.textContent = 'Tasti rapidi';
    const ul = document.createElement('ul');
    for (const [t, d] of voci) { const li = document.createElement('li'); const k = document.createElement('kbd'); k.textContent = t; li.append(k, ' ', d); ul.append(li); }
    const p = document.createElement('p'); p.className = 'nota'; p.textContent = 'Esc per chiudere.';
    pannello.append(h, ul, p);
    document.body.append(pannello);
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { chiudi(); if (document.activeElement?.closest('form.cerca-globale')) document.activeElement.blur(); return; }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) { const b = nuovo(); if (b) { e.preventDefault(); b.click(); } return; }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !inCasella(document.activeElement)) { e.preventDefault(); if (pannello) chiudi(); else apri(); }
  });
  document.addEventListener('pointerdown', e => { if (pannello && !pannello.contains(e.target)) chiudi(); });
})();
