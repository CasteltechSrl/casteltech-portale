// Pagina della riga BOM (Adriano 4/11/2026): scelte famiglia e tecnologia si vedono solo i campi che servono, con un esempio.
// Le regole stanno in src/engine/codifica/campi-famiglia.ts; qui si legge la mappa da data-campi.
(function () {
  const blocco = document.querySelector('[data-campi]');
  if (!blocco) return;
  let mappa = {};
  try { mappa = JSON.parse(blocco.dataset.campi); } catch (e) { return; }
  const modulo = blocco.closest('form');
  const famiglia = modulo.querySelector('select[name="famiglia"]');
  const tecnologia = modulo.querySelector('select[name="tecnologia"]');
  const etichette = blocco.querySelectorAll('label[data-campo]');
  const spiegazione = modulo.querySelector('.campi-spiegazione');
  const tutti = modulo.querySelector('.campi-tutti');
  let mostraTutti = false;

  function aggiorna() {
    const fam = mappa[famiglia.value];
    const tht = tecnologia && tecnologia.value === 'T';
    etichette.forEach(l => {
      const k = l.dataset.campo, input = l.querySelector('input');
      const serve = !fam || fam.campi.includes(k);
      l.hidden = !serve && !mostraTutti;
      l.classList.toggle('campo-non-serve', !serve);
      const es = fam ? ((tht && fam.esempiTht[k]) || fam.esempi[k] || '') : '';
      input.placeholder = es ? 'es. ' + es : '';
    });
    if (spiegazione) spiegazione.textContent = fam
      ? 'Per questa famiglia servono: ' + fam.campi.map(k => blocco.querySelector('label[data-campo="' + k + '"]').dataset.nome).join(', ') + '.'
      : 'Scegli la famiglia: si vedranno solo i campi da compilare.';
    if (tutti) { tutti.hidden = !fam; tutti.textContent = mostraTutti ? 'Mostra solo i campi che servono' : 'Mostra tutti i campi'; }
  }
  famiglia.addEventListener('change', aggiorna);
  if (tecnologia) tecnologia.addEventListener('change', aggiorna);
  if (tutti) tutti.addEventListener('click', e => { e.preventDefault(); mostraTutti = !mostraTutti; aggiorna(); });
  aggiorna();
})();
