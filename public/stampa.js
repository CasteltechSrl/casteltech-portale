// Scheda di produzione e preventivo: pulsante di stampa (il browser permette anche "Salva come PDF").
document.getElementById('stampa').addEventListener('click', () => window.print());

// Stampa del preventivo (Adriano 4/11/2026, P2026-2388): deve mostrare sempre l'ultima versione salvata.
// Tornando indietro col browser la pagina si ricarica; tornando su questa scheda dopo aver salvato il preventivo
// in un'altra, la pagina si accorge che il preventivo è cambiato e si ricarica da sola.
(() => {
  window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
  const url = document.body.dataset.versioneUrl;
  if (!url) return;
  const leggi = () => fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(x => (x ? x.versione : null)).catch(() => null);
  let versione = null;
  leggi().then(v => { versione = v; });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !versione) return;
    const v = await leggi();
    if (v && v !== versione) location.reload();
  });
})();
