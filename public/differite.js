// Fatture differite (Adriano 10/11/2026): "Salva" sulla riga di un DDT manda la scelta senza ricaricare la pagina.
// Con un motivo per non fatturarlo la riga sparisce (e il DDT esce da "Fattura tutti i DDT" del cliente); con "Da fatturare" resta.
// Se il portale non risponde in JSON si invia il modulo come prima.
(() => {
  document.addEventListener('submit', async e => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.action.endsWith('/amministrazione/differite/scelta')) return;
    e.preventDefault();
    const bottone = form.querySelector('button');
    if (bottone) bottone.disabled = true;
    const riga = form.closest('tr');
    try {
      const res = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(new FormData(form)), credentials: 'same-origin' });
      const j = res.ok ? await res.json().catch(() => null) : null;
      if (!j) { form.submit(); return; }
      if (j.tolto && riga) {
        const sezione = riga.closest('section');
        const id = form.querySelector('input[name="id"]')?.value;
        sezione?.querySelectorAll('input[name="ddt[]"]').forEach(i => { if (i.value === id && !i.closest('td')) i.remove(); });
        riga.remove();
        if (sezione && !sezione.querySelector('tbody tr')) sezione.remove();
      } else {
        avviso(riga, j.messaggio);
        if (bottone) bottone.disabled = false;
      }
    } catch {
      form.submit();
    }
  });
  const avviso = (riga, testo) => {
    if (!riga) return;
    let n = riga.querySelector('.esito-scelta');
    if (!n) { n = document.createElement('span'); n.className = 'nota esito-scelta'; riga.querySelector('td.scelta-differita')?.append(n); }
    n.textContent = ' ' + testo;
  };
})();
