// Impostazioni → Anagrafiche: maiuscolo mentre si scrive e caricamento del file dell'elenco ufficiale
document.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => {
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
}));
const bottone = document.getElementById('carica-anagrafiche');
bottone?.addEventListener('click', async () => {
  const out = document.getElementById('esito-anagrafiche');
  const f = document.getElementById('file-anagrafiche').files[0];
  if (!f) { out.textContent = 'Scegli prima il file.'; return; }
  bottone.disabled = true; out.textContent = 'Caricamento in corso… (può richiedere un minuto)';
  const res = await fetch('/impostazioni/anagrafiche/carica', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
  const j = await res.json().catch(() => ({}));
  bottone.disabled = false;
  if (!res.ok) { out.textContent = j.errore || 'Errore nel caricamento'; return; }
  out.textContent = `Fatto: ${j.clienti} clienti e ${j.prodotti} prodotti in anagrafica. Preventivi: ${j.preventivi.collegati} di ${j.preventivi.totale} collegati a un cliente, ` +
    `${j.preventivi.prodottiCollegati} a un prodotto. Tolti ${j.clientiTolti} clienti e ${j.prodottiTolti} prodotti non in elenco. Ricarica la pagina per vedere gli elenchi.`;
});
