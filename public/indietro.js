// Freccia "torna indietro" in alto a sinistra in ogni pagina (Adriano 14/11/2026: "da Banca e carte entro in Fatture o Previsione di cassa
// e mi serve una freccia per tornare alla pagina d'origine"). La freccia è nel layout comune (views/layout.ts): vale per tutte le pagine,
// anche quelle nuove. Il browser ricorda le pagine aperte in questa scheda (sessionStorage); la stessa pagina con altri filtri, un salvataggio
// o un messaggio non conta come pagina nuova, così la freccia porta davvero alla pagina da cui si è arrivati. Senza pagina prima: la pagina
// principale della sezione (data-ripiego dal server). Test in tests/indietro.test.ts.
(function () {
  var CHIAVE = 'pagine-aperte';
  var MAX = 30;
  // parametri che cambiano pagina (es. /amministrazione/documenti?tipo=ddt e ?tipo=fattura sono due pagine del menu); gli altri sono filtri
  var PARAMETRI_PAGINA = ['tipo', 'sezione', 'vista', 'foglio', 'p', 'f', 'id', 'codice', 'cliente', 'fattura'];

  function chiavePagina(url) {
    var i = url.indexOf('?');
    var percorso = (i < 0 ? url : url.slice(0, i)).split('#')[0].replace(/\/+$/, '') || '/';
    if (i < 0) return percorso;
    var resto = url.slice(i + 1).split('#')[0].split('&');
    var tenuti = [];
    for (var k = 0; k < resto.length; k++) {
      var nome = decodeURIComponent(resto[k].split('=')[0] || '');
      if (PARAMETRI_PAGINA.indexOf(nome) >= 0) tenuti.push(resto[k]);
    }
    tenuti.sort();
    return percorso + (tenuti.length ? '?' + tenuti.join('&') : '');
  }

  /** Aggiorna l'elenco delle pagine aperte con la pagina appena caricata. */
  function aggiornaPila(pila, voce) {
    pila = (pila || []).slice();
    var n = pila.length;
    var chiave = chiavePagina(voce.u);
    if (n && chiavePagina(pila[n - 1].u) === chiave) { pila[n - 1] = voce; return pila; } // stessa pagina (filtri, salvataggio, ricarica)
    if (n >= 2 && chiavePagina(pila[n - 2].u) === chiave) { pila.pop(); pila[pila.length - 1] = voce; return pila; } // tornato indietro
    pila.push(voce);
    if (pila.length > MAX) pila = pila.slice(pila.length - MAX);
    return pila;
  }

  /** Dove porta la freccia: la pagina prima, altrimenti il ripiego se è un'altra pagina, altrimenti niente. */
  function destinazione(pila, ripiego) {
    if (pila.length >= 2) return pila[pila.length - 2];
    var attuale = pila.length ? pila[pila.length - 1].u : '';
    if (ripiego && chiavePagina(ripiego) !== chiavePagina(attuale)) return { u: ripiego, t: '' };
    return null;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { chiavePagina: chiavePagina, aggiornaPila: aggiornaPila, destinazione: destinazione }; return; }

  var freccia = document.querySelector('a.freccia-indietro');
  if (!freccia) return;
  var pila = [];
  try { pila = JSON.parse(sessionStorage.getItem(CHIAVE) || '[]') || []; } catch (e) { pila = []; }
  var titolo = (document.title || '').replace(/\s*·\s*Portale Casteltech\s*$/, '');
  pila = aggiornaPila(pila, { u: location.pathname + location.search, t: titolo });
  try { sessionStorage.setItem(CHIAVE, JSON.stringify(pila)); } catch (e) { /* navigazione privata: solo il ripiego */ }
  var dove = destinazione(pila, freccia.getAttribute('data-ripiego'));
  if (!dove) return;
  freccia.href = dove.u;
  freccia.title = dove.t ? 'Torna a: ' + dove.t : 'Torna alla pagina principale della sezione';
  freccia.setAttribute('aria-label', freccia.title);
  freccia.hidden = false;
  // Alt+freccia sinistra resta quello del browser; qui niente tasti in più
})();
