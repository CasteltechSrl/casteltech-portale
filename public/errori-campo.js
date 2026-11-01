// Errori accanto al campo (regole in src/engine/errori-campo.ts).
// All'invio di un modulo POST classico si salvano i valori scritti; se la pagina torna con ?campo=nome (e ?msg=testo)
// i valori vengono rimessi al loro posto, il messaggio compare sotto il campo e il cursore ci va sopra.
(function () {
  var CHIAVE = 'errori-campo';
  function salvaValori(form) {
    if (form.method.toLowerCase() !== 'post' || form.dataset.autosalva || form.id === 'preventivo') return;
    var valori = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'password' || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) valori[el.name] = el.value; return; }
      valori[el.name] = el.value;
    });
    try { sessionStorage.setItem(CHIAVE, JSON.stringify({ id: form.id || '', action: form.getAttribute('action') || location.pathname, valori: valori })); } catch (e) { /* senza memoria del browser il messaggio resta solo in cima */ }
  }
  document.addEventListener('submit', function (e) { if (e.target && e.target.tagName === 'FORM') salvaValori(e.target); }, true);

  var params = new URLSearchParams(location.search);
  var campo = params.get('campo'), msg = params.get('msg'), modulo = params.get('modulo');
  var salvato = null;
  try { salvato = JSON.parse(sessionStorage.getItem(CHIAVE) || 'null'); sessionStorage.removeItem(CHIAVE); } catch (e) { salvato = null; }
  if (!campo) return;

  // il modulo: quello indicato, altrimenti quello del salvataggio, altrimenti il primo con quel campo
  var form = (modulo && document.getElementById(modulo)) || (salvato && salvato.id && document.getElementById(salvato.id)) || null;
  if (!form && salvato && salvato.action) form = document.querySelector('form[action="' + salvato.action.replace(/"/g, '\\"') + '"]');
  if (!form) {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length && !form; i++) if (forms[i].elements[campo]) form = forms[i];
  }
  if (!form) return;

  if (salvato && salvato.valori && (!salvato.id || salvato.id === form.id)) {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'password' || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      if (el.type === 'checkbox' || el.type === 'radio') { el.checked = salvato.valori[el.name] === el.value; return; }
      if (el.name in salvato.valori) el.value = salvato.valori[el.name];
    });
  }
  var el = form.elements[campo];
  if (el && el.length && !el.tagName) el = el[0];
  if (!el) return;
  el.classList.add('con-errore');
  var testo = document.createElement('span');
  testo.className = 'errore-campo';
  testo.textContent = msg || 'Controlla questo campo.';
  var dove = el.closest('label') || el;
  dove.insertAdjacentElement('afterend', testo);
  try { el.focus(); el.scrollIntoView({ block: 'center' }); } catch (e) { /* vecchi browser */ }
})();
