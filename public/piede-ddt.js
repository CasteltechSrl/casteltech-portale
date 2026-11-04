// Stampa del DDT (Adriano 4/11/2026, come i DDT di FIC): il riquadro sotto le righe (aspetto, colli, peso, inizio trasporto, vettore, firme)
// sta SEMPRE in fondo alla pagina, qualunque sia il numero di righe; con più pagine in fondo all'ultima.
// La pagina a schermo ha la stessa larghezza utile della stampa (194 mm), quindi le misure prese qui valgono anche sulla carta:
// si ripete l'impaginazione delle righe (la testata della tabella si ripete su ogni pagina) e si calcola lo spazio da lasciare sopra il piede.
(function () {
  /**
   * Misure in px. pagina = altezza utile di un foglio; inizioRighe = da inizio pagina all'inizio della tabella; testata = altezza
   * della testata della tabella; righe = altezza di ogni riga; piede = altezza del piede; stacco = spazio minimo sopra il piede.
   * Restituisce { margine, nuovaPagina }: spazio sopra il piede e se il piede deve andare su un foglio nuovo.
   */
  function spazioSopraPiede({ pagina, inizioRighe, testata, righe, piede, stacco }) {
    let y = inizioRighe + testata;
    for (const h of righe) {
      if (y + h > pagina && y > testata) y = testata + h;   // la riga non ci sta: foglio nuovo con la testata ripetuta
      else y += h;
    }
    if (y + stacco + piede <= pagina) return { margine: pagina - y - piede, nuovaPagina: false };
    return { margine: Math.max(0, pagina - piede), nuovaPagina: true };
  }
  if (typeof window !== 'undefined') window.piedeDdt = { spazioSopraPiede };
  if (typeof document === 'undefined') return;

  const sezione = document.querySelector('.ddt-stampa:not(.fattura-stampa)');
  const piede = sezione?.querySelector('.piede-ddt');
  const tabella = sezione?.querySelector('table.righe-ddt');
  if (!sezione || !piede || !tabella) return;
  const mm = (() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;visibility:hidden;height:100mm'; document.body.appendChild(d); const v = d.getBoundingClientRect().height / 100; d.remove(); return v; })();
  const ALTEZZA_UTILE = 282 - 1.5;   // A4 297 mm meno i margini di @page (7 + 8 mm), con un filo di sicurezza

  function sistema() {
    piede.style.marginTop = ''; piede.style.breakBefore = '';
    const alto = el => el.getBoundingClientRect();
    const inizio = alto(sezione).top + parseFloat(getComputedStyle(sezione).paddingTop);   // inizio del foglio (dentro i margini)
    const testata = tabella.tHead ? alto(tabella.tHead).height : 0;
    const righe = [...(tabella.tBodies[0]?.rows ?? [])].map(r => alto(r).height);
    const { margine, nuovaPagina } = spazioSopraPiede({
      pagina: ALTEZZA_UTILE * mm, inizioRighe: alto(tabella).top - inizio, testata, righe, piede: alto(piede).height, stacco: 2 * mm,
    });
    piede.style.marginTop = `${Math.floor(margine)}px`;
    if (nuovaPagina) piede.style.breakBefore = 'page';
  }
  sistema();
  document.fonts?.ready.then(sistema);
  window.addEventListener('load', sistema);
  window.addEventListener('beforeprint', sistema);
})();
