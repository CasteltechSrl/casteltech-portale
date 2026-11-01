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
