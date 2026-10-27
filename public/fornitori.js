// Anagrafiche → Fornitori: maiuscolo mentre si scrive; caricamento del file in due passi (riepilogo, poi conferma)
document.querySelectorAll('input.maiuscolo, textarea.maiuscolo').forEach(el => el.addEventListener('input', () => {
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
}));
document.querySelectorAll('tr.cliccabile[data-href]').forEach(tr => tr.addEventListener('click', e => {
  if (!e.target.closest('a, button, input')) location.href = tr.dataset.href;
}));
const controlla = document.getElementById('carica-fornitori');
const conferma = document.getElementById('conferma-fornitori');
const out = document.getElementById('esito-fornitori');
async function invia(definitivo) {
  const f = document.getElementById('file-fornitori').files[0];
  if (!f) { out.textContent = 'Scegli prima il file.'; return; }
  controlla.disabled = conferma.disabled = true;
  out.textContent = definitivo ? 'Caricamento in corso…' : 'Controllo del file…';
  const res = await fetch(`/anagrafiche/fornitori/carica?conferma=${definitivo ? 1 : 0}`,
    { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
  const j = await res.json().catch(() => ({}));
  controlla.disabled = conferma.disabled = false;
  if (!res.ok) { out.textContent = j.errore || 'Errore'; conferma.hidden = true; return; }
  let testo = `${j.nuovi} fornitori nuovi, ${j.aggiornati} aggiornati, ${j.uguali} già uguali, ${j.saltati.length} saltati.`;
  if (j.saltati.length) testo += ' Saltati: ' + j.saltati.slice(0, 10).map(s => `${s.nome} (${s.motivo})`).join('; ') + (j.saltati.length > 10 ? '…' : '');
  if (j.anteprima) { out.textContent = 'Se confermi: ' + testo; conferma.hidden = false; }
  else { out.textContent = 'Fatto: ' + testo + ' Ricarica la pagina per vedere l\'elenco.'; conferma.hidden = true; }
}
controlla?.addEventListener('click', () => invia(false));
conferma?.addEventListener('click', () => invia(true));
