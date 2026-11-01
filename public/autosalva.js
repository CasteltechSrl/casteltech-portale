// Bozze che si salvano da sole (1/11/2026): il modulo #modulo-documento con data-autosalva="1" (fattura, NC, DDT, conferma
// d'ordine, ordine a fornitore in bozza) viene salvato 2 secondi dopo l'ultima modifica, senza ricaricare la pagina.
// - accanto a "Salva" compare lo stato: "Modifiche non salvate…", "Salvato alle 10:32", "Non salvato: …" (in rosso);
// - Ctrl+S (Cmd+S) preme Salva; chiudendo la pagina con modifiche non ancora salvate il browser chiede conferma;
// - il salvataggio automatico usa lo stesso indirizzo del pulsante Salva con l'intestazione X-Autosalva (risposta JSON).
(() => {
  const form = document.getElementById('modulo-documento');
  if (!form || form.dataset.autosalva !== '1') return;
  const ATTESA_MS = 2000;
  // il pulsante Salva (non "+ Nuovo prodotto" o altri pulsanti type=button del modulo)
  const salvaBtn = form.querySelector('.barra-azioni button.primario:not([type=button])') ?? form.querySelector('button.primario:not([type=button])');
  const stato = document.createElement('span');
  stato.className = 'nota stato-autosalva';
  stato.setAttribute('aria-live', 'polite');
  if (salvaBtn) salvaBtn.before(stato); else form.append(stato);

  let timer = 0, modifiche = false, inCorso = false, daRifare = false, inviato = false;
  const mostra = (testo, negativo) => { stato.textContent = testo; stato.classList.toggle('negativo', !!negativo); };

  const salva = async () => {
    if (inCorso) { daRifare = true; return; }
    inCorso = true;
    mostra('Salvataggio…');
    try {
      const res = await fetch(form.action, { method: 'POST', headers: { 'X-Autosalva': '1', Accept: 'application/json' }, body: new URLSearchParams(new FormData(form)), credentials: 'same-origin' });
      const j = res.ok ? await res.json().catch(() => null) : null;
      if (!j) mostra('Non salvato: portale non raggiungibile. Premi Salva o riprova tra poco.', true);
      else if (j.ok) { modifiche = false; mostra(`Salvato alle ${j.ora}`); }
      else mostra(`Non salvato: ${(j.errori || []).join(' ')}`, true);
    } catch {
      mostra('Non salvato: controlla la connessione, poi premi Salva.', true);
    } finally {
      inCorso = false;
      if (daRifare) { daRifare = false; salva(); }
    }
  };
  const programma = () => { modifiche = true; mostra('Modifiche non salvate…'); clearTimeout(timer); timer = setTimeout(salva, ATTESA_MS); };
  form.addEventListener('input', programma);
  form.addEventListener('change', programma);
  document.addEventListener('click', e => { if (e.target.closest('#aggiungi-riga')) programma(); });   // riga nuova: si salva vuota, non fa danni

  form.addEventListener('submit', () => { clearTimeout(timer); inviato = true; });
  document.addEventListener('keydown', e => {
    if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); clearTimeout(timer);
      try { if (salvaBtn) form.requestSubmit(salvaBtn); else form.requestSubmit(); } catch { form.requestSubmit(); }
    }
  });
  window.addEventListener('beforeunload', e => {
    if (inviato || (!modifiche && !inCorso)) return;
    e.preventDefault();
    e.returnValue = '';
  });
})();
