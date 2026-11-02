/*
 * Moduli del sito casteltech.net (Contatti e Richiedi un preventivo).
 * Il sito è fatto di pagine statiche: i moduli li riceve il Portale Casteltech (/api/sito/contatto e /api/sito/preventivo,
 * src/server/rotte/sito.ts). Questo script prende l'invio al posto di Contact Form 7 di WordPress.
 * Indirizzo del portale nell'attributo data-portale del tag <script>.
 */
(function () {
  var script = document.currentScript;
  var portale = (script && script.getAttribute('data-portale')) || 'https://casteltech-portale.onrender.com';
  var en = /^\/en(\/|$)/.test(location.pathname);
  var T = en ? {
    invio: 'Sending…', ok: 'Thank you, your message has been sent. We will reply as soon as possible.',
    campi: 'Please fill in the required fields (marked in red) and accept the privacy policy.',
    errore: 'Sorry, the message could not be sent. Please write to info@casteltech.net.',
    grande: 'The attached files are too large (max 40 MB in total). Please send them to info@casteltech.net.'
  } : {
    invio: 'Invio in corso…', ok: 'Grazie, il messaggio è stato inviato. Vi risponderemo al più presto.',
    campi: 'Compilate i campi obbligatori (in rosso) e accettate l\'informativa sulla privacy.',
    errore: 'Non è stato possibile inviare il messaggio. Scrivete a info@casteltech.net.',
    grande: 'I file allegati sono troppo grandi (massimo 40 MB in tutto). Mandateli a info@casteltech.net.'
  };
  var NOMI = {
    nome: ['your-name'], email: ['your-email', 'companymail'], messaggio: ['your-message'], privacy: ['checkbox-361[]'], azienda: ['company']
  };

  function prepara(form) {
    form.setAttribute('novalidate', 'novalidate');
    form.removeAttribute('action');
    if (!form.querySelector('[name="sito_web"]')) {
      var trappola = document.createElement('input');   // casella trappola: le persone non la vedono, i robot la riempiono
      trappola.type = 'text'; trappola.name = 'sito_web'; trappola.tabIndex = -1; trappola.autocomplete = 'off';
      trappola.setAttribute('aria-hidden', 'true');
      trappola.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
      form.appendChild(trappola);
    }
    form.setAttribute('data-aperto-il', String(Date.now()));
  }

  function messaggio(form, testo, tipo) {
    var out = form.querySelector('.wpcf7-response-output');
    if (!out) { out = document.createElement('div'); out.className = 'wpcf7-response-output'; form.appendChild(out); }
    out.textContent = testo;
    out.setAttribute('aria-hidden', 'false');
    out.setAttribute('role', 'status');
    out.style.display = 'block';
    out.style.borderColor = tipo === 'ok' ? '#46b450' : tipo === 'attesa' ? '#ccc' : '#dc3232';
    form.classList.remove('sent', 'invalid', 'failed', 'submitting');
    form.classList.add(tipo === 'ok' ? 'sent' : tipo === 'attesa' ? 'submitting' : tipo === 'campi' ? 'invalid' : 'failed');
  }

  function segnaCampi(form, campi) {
    form.querySelectorAll('.wpcf7-not-valid').forEach(function (el) { el.classList.remove('wpcf7-not-valid'); el.removeAttribute('aria-invalid'); });
    (campi || []).forEach(function (c) {
      (NOMI[c] || []).forEach(function (n) {
        form.querySelectorAll('[name="' + n + '"]').forEach(function (el) { el.classList.add('wpcf7-not-valid'); el.setAttribute('aria-invalid', 'true'); });
      });
    });
  }

  function invia(e) {
    var form = e.target;
    if (!form.classList || !form.classList.contains('wpcf7-form')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var preventivo = form.querySelector('[name="company"]') !== null;
    var dati = new FormData(form);
    dati.append('aperto_il', form.getAttribute('data-aperto-il') || '');
    dati.append('lingua', en ? 'en' : 'it');
    var totale = 0;
    dati.forEach(function (v) { if (v && typeof v === 'object' && 'size' in v) totale += v.size; });
    if (totale > 40 * 1024 * 1024) return messaggio(form, T.grande, 'errore');
    var bottone = form.querySelector('[type="submit"]');
    if (bottone) bottone.disabled = true;
    messaggio(form, T.invio, 'attesa');
    fetch(portale + '/api/sito/' + (preventivo ? 'preventivo' : 'contatto'), { method: 'POST', body: dati, mode: 'cors' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j, stato: r.status }; }); })
      .then(function (x) {
        if (x.ok && x.j.ok) { segnaCampi(form, []); form.reset(); prepara(form); return messaggio(form, T.ok, 'ok'); }
        if (x.j && x.j.errore === 'campi') { segnaCampi(form, x.j.campi); return messaggio(form, T.campi, 'campi'); }
        messaggio(form, x.stato === 413 ? T.grande : T.errore, 'errore');
      })
      .catch(function () { messaggio(form, T.errore, 'errore'); })
      .then(function () { if (bottone) bottone.disabled = false; });
  }

  function avvia() { document.querySelectorAll('form.wpcf7-form').forEach(prepara); }
  document.addEventListener('submit', invia, true);   // fase di cattura: prima di qualunque altro script della pagina
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
