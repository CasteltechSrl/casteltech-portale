// Amministrazione → bozza di fattura / nota di credito: "+ Riga" aggiunge una riga vuota in fondo; codici in maiuscolo mentre si scrive
const tabella = document.querySelector('#righe-documento tbody');
document.getElementById('aggiungi-riga')?.addEventListener('click', () => {
  const ultima = tabella.lastElementChild;
  const nuova = ultima.cloneNode(true);
  const indice = tabella.children.length;
  nuova.className = '';
  nuova.querySelectorAll('input, select').forEach(el => {
    el.name = el.name.replace(/righe\[\d+\]/, `righe[${indice}]`);
    if (el.type === 'checkbox') el.checked = false; else el.value = '';
  });
  nuova.querySelectorAll('.nota').forEach(el => el.remove());
  tabella.appendChild(nuova);
  nuova.querySelector('input[name$="[descrizione]"]').focus();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.classList?.contains('maiuscolo')) return;
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
});
