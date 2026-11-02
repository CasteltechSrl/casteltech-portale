// X per chiudere gli avvisi in cima alla pagina (Adriano 2/11/2026).
// - Avviso dei servizi (data-chiave): chiuso resta nascosto in questo browser finché non cambia il problema
//   (la chiave la calcola il portale dal testo e dall'ultimo riavvio: un problema nuovo = chiave nuova = ricompare).
// - Messaggi dopo un salvataggio ("Salvato.", "DDT corretto…"): spariscono e si toglie ?msg= dall'indirizzo,
//   così ricaricando la pagina non tornano.
(() => {
  const NOME = 'avvisi-chiusi', GIORNI = 30;
  const leggi = () => { try { return JSON.parse(localStorage.getItem(NOME) || '{}') || {}; } catch { return {}; } };
  const scrivi = (o) => { try { localStorage.setItem(NOME, JSON.stringify(o)); } catch { /* browser senza memoria: pazienza */ } };
  // chiavi vecchie tolte dopo 30 giorni
  const chiusi = leggi(), limite = Date.now() - GIORNI * 86400000;
  for (const k of Object.keys(chiusi)) if (!(chiusi[k] > limite)) delete chiusi[k];
  scrivi(chiusi);

  document.querySelectorAll('.avviso.chiudibile').forEach(av => {
    const chiave = av.dataset.chiave;
    if (chiave && chiusi[chiave]) { av.remove(); return; }
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'chiudi-avviso'; x.textContent = '\u00d7'; // ×
    x.title = 'Chiudi (l\'ho letto)'; x.setAttribute('aria-label', 'Chiudi l\'avviso');
    x.addEventListener('click', () => {
      av.remove();
      if (chiave) { const o = leggi(); o[chiave] = Date.now(); scrivi(o); return; }
      try {
        const u = new URL(location.href);
        if (u.searchParams.has('msg')) { u.searchParams.delete('msg'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
      } catch { /* niente */ }
    });
    av.appendChild(x);
  });
})();
