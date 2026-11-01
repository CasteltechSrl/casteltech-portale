// Menu del profilo Contabilità (pagine in fila, senza tendine): accende la voce della pagina aperta (il prefisso più lungo).
(() => {
  const voci = [...document.querySelectorAll('.testata nav.menu-piatto a')];
  const qui = location.pathname.replace(/\/+$/, '') || '/';
  let migliore = null;
  for (const a of voci) {
    const h = new URL(a.href).pathname.replace(/\/+$/, '');
    if ((qui === h || qui.startsWith(h + '/')) && (!migliore || h.length > migliore.h.length)) migliore = { a, h };
  }
  if (migliore) migliore.a.classList.add('attiva');
})();

// Menu in alto a gruppi: tendine meno sensibili (Adriano 31/10/2026: "spariscono spessissimo passando nei sottomenu").
// - la tendina si apre passando sopra al nome del gruppo e si chiude solo dopo CHIUSURA_MS che il mouse è uscito:
//   se si scivola fuori per un attimo (o in diagonale verso una voce) resta aperta;
// - passando sopra un altro gruppo mentre una tendina è aperta si cambia solo se il mouse si ferma lì per CAMBIO_MS
//   (così attraversare in diagonale il gruppo vicino non chiude quello che si stava usando);
// - clic sul nome del gruppo: se la tendina è chiusa (es. tablet) la apre, se è già aperta va alla prima pagina come prima;
// - clic fuori dal menu o tasto Esc: chiude; tastiera (Tab) apre il gruppo che ha il fuoco.
(() => {
  const CHIUSURA_MS = 450;
  const CAMBIO_MS = 180;
  const testata = document.querySelector('.testata');
  const gruppi = [...document.querySelectorAll('.testata .gruppo')];
  if (!testata || gruppi.length === 0) return;
  testata.classList.add('menu-js');

  let aperto = null;
  let timerChiusura = 0;
  let timerCambio = 0;
  const ferma = () => { clearTimeout(timerChiusura); clearTimeout(timerCambio); };
  const apri = g => {
    ferma();
    if (aperto && aperto !== g) aperto.classList.remove('aperto');
    g.classList.add('aperto');
    aperto = g;
  };
  const chiudi = () => {
    ferma();
    if (aperto) aperto.classList.remove('aperto');
    aperto = null;
  };

  for (const g of gruppi) {
    g.addEventListener('pointerenter', e => {
      if (e.pointerType === 'touch') return;
      clearTimeout(timerChiusura);
      if (aperto === g) { clearTimeout(timerCambio); return; }
      if (!aperto) { apri(g); return; }
      clearTimeout(timerCambio);
      timerCambio = setTimeout(() => apri(g), CAMBIO_MS);
    });
    g.addEventListener('pointerleave', e => {
      if (e.pointerType === 'touch') return;
      clearTimeout(timerCambio);
      if (aperto !== g) return;
      clearTimeout(timerChiusura);
      timerChiusura = setTimeout(chiudi, CHIUSURA_MS);
    });
    const titolo = g.querySelector('.titolo-gruppo');
    titolo?.addEventListener('click', e => {
      if (aperto !== g) { e.preventDefault(); apri(g); }
    });
    g.addEventListener('focusin', () => { if (aperto !== g) apri(g); });
  }

  document.addEventListener('click', e => { if (aperto && !aperto.contains(e.target)) chiudi(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(); });
  document.addEventListener('focusin', e => { if (aperto && !aperto.contains(e.target)) chiudi(); });
})();
