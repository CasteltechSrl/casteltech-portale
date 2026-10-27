// Anagrafiche → Clienti e Prodotti: maiuscolo mentre si scrive; caricamento del file in due passi (riepilogo, poi conferma)
// la tendina del cliente (Prodotti) filtra subito, senza tasto
document.querySelectorAll('select.invia-subito').forEach(s => s.addEventListener('change', () => s.form.submit()));
document.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => {
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
}));
const controlla = document.getElementById('carica-anagrafiche');
const conferma = document.getElementById('conferma-anagrafiche');
const out = document.getElementById('esito-anagrafiche');
async function invia(definitivo) {
  const f = document.getElementById('file-anagrafiche').files[0];
  if (!f) { out.textContent = 'Scegli prima il file.'; return; }
  const togli = document.getElementById('togli-anagrafiche').checked ? '1' : '0';
  controlla.disabled = conferma.disabled = true;
  out.textContent = definitivo ? 'Caricamento in corso…' : 'Controllo del file…';
  const res = await fetch(`/anagrafiche/carica?togli=${togli}&conferma=${definitivo ? 1 : 0}`,
    { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
  const j = await res.json().catch(() => ({}));
  controlla.disabled = conferma.disabled = false;
  if (!res.ok) { out.textContent = j.errore || 'Errore'; conferma.hidden = true; return; }
  const testo = `${j.clientiNuovi} clienti nuovi, ${j.prodottiNuovi} prodotti nuovi, ${j.descrizioniCambiate} descrizioni che cambiano, ` +
    `${j.clientiTolti} clienti e ${j.prodottiTolti} prodotti tolti. Preventivi collegati a un cliente: ${j.preventivi.collegati} di ${j.preventivi.totale}.`;
  if (j.anteprima) { out.textContent = 'Se confermi: ' + testo; conferma.hidden = false; }
  else { out.textContent = 'Fatto: ' + testo + ' Ricarica la pagina per vedere gli elenchi.'; conferma.hidden = true; }
}
controlla?.addEventListener('click', () => invia(false));
conferma?.addEventListener('click', () => invia(true));
