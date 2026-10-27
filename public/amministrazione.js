// Impostazioni → Amministrazione: maiuscolo mentre si scrive; caricamento dei file preparati da Claude in due passi (riepilogo, poi conferma)
document.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => {
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
}));
const elenco = (titolo, voci) => voci.length ? `\n${titolo} (${voci.length}): ${voci.slice(0, 15).join('; ')}${voci.length > 15 ? '…' : ''}` : '';
const euro = n => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

function caricamento(nome, riepilogo) {
  const controlla = document.getElementById(`carica-${nome}`);
  const conferma = document.getElementById(`conferma-${nome}`);
  const out = document.getElementById(`esito-${nome}`);
  if (!controlla) return;
  async function invia(definitivo) {
    const f = document.getElementById(`file-${nome}`).files[0];
    if (!f) { out.textContent = 'Scegli prima il file.'; return; }
    controlla.disabled = conferma.disabled = true;
    out.textContent = definitivo ? 'Caricamento in corso…' : 'Controllo del file…';
    const res = await fetch(`/impostazioni/amministrazione/${nome}?conferma=${definitivo ? 1 : 0}`,
      { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    controlla.disabled = conferma.disabled = false;
    out.style.whiteSpace = 'pre-line';
    if (!res.ok) { out.textContent = j.errore || 'Errore'; conferma.hidden = true; return; }
    if (j.anteprima) { out.textContent = 'Se confermi: ' + riepilogo(j); conferma.hidden = false; }
    else { out.textContent = 'Fatto: ' + riepilogo(j); conferma.hidden = true; }
  }
  controlla.addEventListener('click', () => invia(false));
  conferma.addEventListener('click', () => invia(true));
}

caricamento('clienti-fic', j => `${j.aggiornati} clienti aggiornati, ${j.uguali} già uguali, ${j.lettereNuove} lettere d'intento nuove.`
  + elenco('Condizioni di pagamento nuove', j.condizioniNuove)
  + elenco('Da controllare', j.avvisi.map(a => `${a.nome}: ${a.avviso}`))
  + elenco('Non in anagrafica (non aggiunti)', j.nonInAnagrafica));

caricamento('storico-fic', j => Object.entries(j.documenti).map(([tipo, n]) => `${tipo}: ${n.nuovi} nuovi, ${n.aggiornati} aggiornati`).join('; ')
  + `; documenti ricevuti: ${j.ricevuti.nuovi} nuovi, ${j.ricevuti.aggiornati} aggiornati.`
  + `\nDa incassare: ${j.daIncassare.numero} scadenze per ${euro(j.daIncassare.importo)}. Da pagare: ${j.daPagare.numero} scadenze per ${euro(j.daPagare.importo)}.`
  + `\nDDT non fatturati: ${j.ddtDaFatturare}. Documenti ricevuti da fornitori non in anagrafica: ${j.fornitoriSenzaAnagrafica}.`
  + elenco('Numerazioni aggiornate', j.numerazioni)
  + elenco('Intestatari non in anagrafica (documenti caricati lo stesso)', j.senzaAnagrafica)
  + elenco('Non caricati', j.errori));
