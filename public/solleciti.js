// Sollecito incassi (1/11/2026): "Copia il testo" mette oggetto e testo negli appunti, per chi manda dalla propria posta.
(() => {
  const b = document.querySelector('[data-copia-sollecito]');
  if (!b) return;
  b.addEventListener('click', async () => {
    const oggetto = document.querySelector('[name=oggetto]')?.value ?? '', testo = document.querySelector('[name=testo]')?.value ?? '';
    try { await navigator.clipboard.writeText(`Oggetto: ${oggetto}\n\n${testo}`); b.textContent = 'Copiato ✓'; }
    catch { b.textContent = 'Non riesco a copiare: seleziona il testo e copialo a mano'; }
    setTimeout(() => { b.textContent = 'Copia il testo'; }, 3000);
  });
})();

// Pulsante "Pagato" (Adriano 10/11/2026): la rata si segna incassata (anche in parte) senza ricaricare la pagina
document.querySelectorAll('form.pagato-rata').forEach(f => f.addEventListener('submit', async e => {
  e.preventDefault();
  const b = f.querySelector('button');
  b.disabled = true;
  try {
    const r = await fetch(f.action, { method: 'POST', body: new URLSearchParams(new FormData(f)), headers: { 'X-Senza-Ricarica': '1' } });
    const j = await r.json();
    const esito = document.createElement('span');
    esito.className = j.ok ? 'stato doc-consegnato' : 'errore';
    esito.textContent = j.testo;
    if (j.ok) f.replaceWith(esito);
    else { f.after(esito); b.disabled = false; setTimeout(() => esito.remove(), 6000); }
  } catch {
    b.disabled = false;
    alert('Non riesco a salvare: controlla la connessione e riprova.');
  }
}));
