// Numeri e date uniformi in tutto il portale (proposta della revisione, Adriano 1/11/2026).
// - Caselle decimali (inputmode="decimal"): uscendo dalla casella il punto diventa virgola (12.5 → 12,5), come nel resto del portale.
//   Il portale accetta entrambi; così però si vede sempre la stessa scrittura.
//   Punto delle migliaia (Adriano 3/11/2026): "1.800" o "12.500.000" = milleottocento… → si toglie il punto (1800), MAI 1,8.
//   Le migliaia non cominciano con lo zero: "0.125" resta un decimale (0,125), come i prezzi dei componenti.
// - Caselle data (type="date"): il browser le mostra nella SUA lingua. Se il browser non è in italiano, sotto la prima
//   casella data della pagina compare la nota che spiega come leggere le date.
(function () {
  document.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.getAttribute('inputmode') !== 'decimal') return;
    var v = el.value.trim();
    var MIGLIAIA = /^-?[1-9]\d{0,2}(\.\d{3})+$/;
    if (MIGLIAIA.test(v)) {
      el.value = v.replace(/\./g, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (/^-?\d+\.\d+$/.test(v)) {
      el.value = v.replace('.', ',');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  var lingua = (navigator.language || '').toLowerCase();
  if (lingua.indexOf('it') === 0) return;
  var prima = document.querySelector('input[type="date"]');
  if (!prima) return;
  var nota = document.createElement('small');
  nota.className = 'aiuto nota-formato-date';
  nota.textContent = 'Il browser non è in italiano: le date qui si leggono nel suo formato (es. mese/giorno/anno). Per vederle come gg/mm/aaaa imposta l\'italiano nella lingua del browser.';
  var dove = prima.closest('label') || prima;
  dove.insertAdjacentElement('afterend', nota);
})();
