// Tasti "Elimina" (e simili) in tutte le pagine: chiedono conferma con il testo scritto in data-conferma
// (sul pulsante o sul modulo) prima di inviare.
document.addEventListener('submit', e => {
  const testo = e.submitter?.dataset.conferma ?? e.target.dataset.conferma;
  if (testo && !window.confirm(testo)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  // niente doppio invio: dopo il primo clic i pulsanti del modulo si spengono finché la pagina non cambia
  // (il pulsante premuto manda comunque il suo valore: si spegne dopo che il browser ha raccolto i dati)
  if (!e.defaultPrevented && e.target.method?.toLowerCase() === 'post')
    setTimeout(() => { if (!e.defaultPrevented) e.target.querySelectorAll('button, input[type=submit]').forEach(b => { b.disabled = true; }); }, 0);
}, true);
// tornando indietro con la freccia del browser (pagina dalla cache) i pulsanti devono funzionare di nuovo
window.addEventListener('pageshow', () => document.querySelectorAll('form button[disabled], form input[type=submit][disabled]').forEach(b => { b.disabled = false; }));
