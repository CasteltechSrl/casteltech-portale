// Tasti "Elimina" (e simili) in tutte le pagine: chiedono conferma con il testo scritto in data-conferma
// (sul pulsante o sul modulo) prima di inviare.
document.addEventListener('submit', e => {
  const testo = e.submitter?.dataset.conferma ?? e.target.dataset.conferma;
  if (testo && !window.confirm(testo)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
