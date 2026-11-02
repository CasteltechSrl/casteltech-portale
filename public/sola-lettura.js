// Profilo Esterno (Adriano 2/11/2026: vede tutto, non modifica nulla): nelle pagine le caselle dei moduli che salvano
// (method="post") si spengono, così si leggono i valori ma non si cambiano. I pulsanti li nasconde stile.css;
// il portale rifiuta comunque ogni modifica (engine/ruoli.ts, esternoPuo).
if (document.body.classList.contains('sola-lettura-tutto')) {
  const spegni = () => document.querySelectorAll('main form[method="post" i] input, main form[method="post" i] select, main form[method="post" i] textarea')
    .forEach(c => { c.disabled = true; });
  spegni();
  // pagine che aggiungono righe dopo il caricamento
  new MutationObserver(spegni).observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });
}
