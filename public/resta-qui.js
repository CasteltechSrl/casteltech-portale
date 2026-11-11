// Resta dove eri (Adriano 11/11/2026, spunte SMD/THT del flusso di produzione: "la pagina si aggiorna e si posiziona da qualche altra parte").
// 1) Moduli con data-senza-ricarica: si mandano in sottofondo (intestazione X-Senza-Ricarica, il server risponde JSON),
//    il pulsante cambia subito (✓ / ☐) e in fondo allo schermo compare "Aggiorna la pagina" per rivedere conti e firme.
// 2) Tutti gli altri moduli POST: se dopo il salvataggio si torna sulla stessa pagina, la pagina torna allo stesso punto
//    (niente salto in cima o all'ancora). Test in tests/resta-qui.test.ts.
(function () {
  var CHIAVE = 'resta-qui';
  var SECONDI = 60;

  // ——— 1) spunte senza ricaricare ———
  var barra = null, cambiate = 0;
  function mostraBarra() {
    if (!barra) {
      barra = document.createElement('div');
      barra.className = 'barra-aggiorna';
      barra.innerHTML = '<span></span> <button type="button" class="primario piccolo">Aggiorna la pagina</button>';
      barra.querySelector('button').addEventListener('click', function () { ricorda(); location.reload(); });
      document.body.appendChild(barra);
    }
    barra.querySelector('span').textContent = cambiate === 1 ? '1 spunta salvata.' : cambiate + ' spunte salvate.';
  }
  function cambiaPulsante(form, dati) {
    var b = form.querySelector('button');
    var valore = form.querySelector('input[name=valore]');
    if (!b || !valore) return;
    var auto = !dati.fatta && form.hasAttribute('data-auto');
    var fatta = !!dati.fatta || auto;
    var testo = b.textContent.replace(/^\s*[\u2713\u2610]\s*/, '');
    b.textContent = (fatta ? '\u2713 ' : '\u2610 ') + testo;
    b.classList.remove('si', 'auto', 'manca');
    if (fatta) b.classList.add(auto ? 'auto' : 'si');
    b.title = auto ? 'Fatta: ci sono tempi del reparto per questa fase' : fatta ? 'Spuntata adesso (premi per togliere)' : 'Premi per spuntare';
    valore.value = dati.fatta ? '0' : '1';
  }
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM' || !form.hasAttribute('data-senza-ricarica') || e.defaultPrevented) return;
    if (!window.fetch || !window.FormData) return; // browser vecchio: invio classico
    e.preventDefault();
    if (form.dataset.inCorso) return;
    form.dataset.inCorso = '1';
    var corpo = new URLSearchParams(new FormData(form, e.submitter || undefined));
    fetch(form.getAttribute('action'), { method: 'POST', body: corpo, credentials: 'same-origin', headers: { 'X-Senza-Ricarica': '1', 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('stato ' + r.status); return r.json(); })
      .then(function (dati) {
        if (!dati || !dati.ok) throw new Error((dati && dati.errore) || 'non salvato');
        cambiaPulsante(form, dati);
        cambiate++;
        mostraBarra();
      })
      .catch(function () { delete form.dataset.inCorso; ricorda(); HTMLFormElement.prototype.submit.call(form); }) // se qualcosa va storto: invio classico
      .then(function () { delete form.dataset.inCorso; });
  });

  // ——— 2) tornare allo stesso punto dopo il salvataggio ———
  function ricorda() {
    try { sessionStorage.setItem(CHIAVE, JSON.stringify({ percorso: location.pathname, y: window.scrollY, x: window.scrollX, il: Date.now() })); } catch (e) { /* niente memoria: si va dove va */ }
  }
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM' || (form.method || '').toLowerCase() !== 'post' || form.target === '_blank') return;
    // si guarda dopo gli altri script: se un modulo è stato fermato (conferma annullata, autosalvataggio) non si ricorda nulla
    setTimeout(function () { if (!e.defaultPrevented) ricorda(); }, 0);
  });

  var salvato = null;
  try { salvato = JSON.parse(sessionStorage.getItem(CHIAVE) || 'null'); sessionStorage.removeItem(CHIAVE); } catch (e) { salvato = null; }
  if (!salvato || salvato.percorso !== location.pathname || Date.now() - salvato.il > SECONDI * 1000) return;
  if (new URLSearchParams(location.search).get('campo')) return; // errore su un campo: ci pensa errori-campo.js
  function torna() { window.scrollTo(salvato.x || 0, salvato.y || 0); }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  torna();
  // dopo il salto all'ancora e dopo che immagini e tabelle hanno preso il loro posto
  window.addEventListener('load', function () { torna(); setTimeout(torna, 50); });
})();
