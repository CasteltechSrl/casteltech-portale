// Anagrafiche → Clienti e Prodotti: maiuscolo mentre si scrive; caricamento del file in due passi (riepilogo, poi conferma)
// la tendina del cliente (Prodotti) filtra subito, senza tasto
document.querySelectorAll('select.invia-subito').forEach(s => s.addEventListener('change', () => s.form.submit()));
document.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => {
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
}));
// Prodotti: la tendina del cliente di ogni riga ha solo il cliente attuale; l'elenco completo si copia dal modello
// al primo clic (o focus da tastiera), così la pagina resta leggera anche con molti prodotti
const modelloClienti = document.getElementById('modello-clienti');
function riempiClienti(sel) {
  if (!modelloClienti || sel.dataset.piena) return;
  const attuale = sel.value;
  sel.replaceChildren(modelloClienti.content.cloneNode(true));
  sel.value = attuale;
  if (sel.value !== attuale) sel.selectedIndex = 0;
  sel.dataset.piena = '1';
}
document.querySelectorAll('select.clienti-al-clic').forEach(sel => {
  sel.addEventListener('pointerdown', () => riempiClienti(sel));
  sel.addEventListener('focus', () => riempiClienti(sel));
  sel.addEventListener('keydown', () => riempiClienti(sel));
});
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
  const testo = `${j.clientiNuovi} clienti nuovi, ${j.prodottiNuovi} prodotti nuovi, ` +
    (j.prodottiSenzaCliente ? `${j.prodottiSenzaCliente} prodotti senza cliente NON caricati (ogni codice deve avere il suo cliente), ` : '') +
    `${j.descrizioniCambiate} descrizioni che cambiano, ` +
    `${j.clientiTolti} clienti e ${j.prodottiTolti} prodotti tolti. Preventivi collegati a un cliente: ${j.preventivi.collegati} di ${j.preventivi.totale}.`;
  if (j.anteprima) { out.textContent = 'Se confermi: ' + testo; conferma.hidden = false; }
  else { out.textContent = 'Fatto: ' + testo + ' Ricarica la pagina per vedere gli elenchi.'; conferma.hidden = true; }
}
controlla?.addEventListener('click', () => invia(false));
conferma?.addEventListener('click', () => invia(true));
// Prezzi da Fatture in Cloud (Adriano 31/10/2026): riepilogo, poi conferma
const controllaPrezzi = document.getElementById('carica-prezzi');
const confermaPrezzi = document.getElementById('conferma-prezzi');
const esitoPrezzi = document.getElementById('esito-prezzi');
async function inviaPrezzi(definitivo) {
  const f = document.getElementById('file-prezzi').files[0];
  if (!f) { esitoPrezzi.textContent = 'Scegli prima il file.'; return; }
  controllaPrezzi.disabled = confermaPrezzi.disabled = true;
  esitoPrezzi.textContent = definitivo ? 'Caricamento in corso…' : 'Controllo del file…';
  const res = await fetch(`/anagrafiche/prezzi?conferma=${definitivo ? 1 : 0}`,
    { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
  const j = await res.json().catch(() => ({}));
  controllaPrezzi.disabled = confermaPrezzi.disabled = false;
  if (!res.ok) { esitoPrezzi.textContent = j.errore || 'Errore'; confermaPrezzi.hidden = true; return; }
  const p = j.prodotti, c = j.componenti;
  const testo = `prodotti con prezzo ${p.conPrezzo} su ${p.inPortale} (${p.daFattura} dall'ultima fattura, ${p.daAnagrafica} dall'anagrafica FIC), ` +
    `${p.senzaPrezzo} restano senza prezzo` + (p.manuali ? `, ${p.manuali} scritti a mano non toccati` : '') + '. ' +
    `Componenti con prezzo d'acquisto ${c.conPrezzo} su ${c.inArchivio} in archivio` + (c.manuali ? ` (${c.manuali} scritti a mano non toccati)` : '') + '.';
  if (j.anteprima) { esitoPrezzi.textContent = 'Se confermi: ' + testo; confermaPrezzi.hidden = false; }
  else { esitoPrezzi.textContent = 'Fatto: ' + testo + ' Ricarica la pagina per vedere i prezzi.'; confermaPrezzi.hidden = true; }
}
controllaPrezzi?.addEventListener('click', () => inviaPrezzi(false));
confermaPrezzi?.addEventListener('click', () => inviaPrezzi(true));
