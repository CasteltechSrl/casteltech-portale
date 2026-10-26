// CRM: righe cliccabili, date rapide della prossima azione, conferme, import da Impostazioni → CRM
document.querySelectorAll('tr[data-href]').forEach(tr => {
  tr.addEventListener('click', e => { if (!e.target.closest('a, button, input, label, form')) location.href = tr.dataset.href; });
});
document.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => { el.value = el.value.toUpperCase(); }));

// pulsanti "domani", "tra 1 settimana", … → data della prossima azione (contando da oggi)
(() => {
  const riquadro = document.querySelector('.date-rapide');
  const campo = document.getElementById('data-prossima');
  if (!riquadro || !campo) return;
  riquadro.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.giorni === '0') { campo.value = ''; const t = document.querySelector('input[name=prossima_azione]'); if (t) t.value = ''; return; }
    const d = new Date(riquadro.dataset.oggi + 'T12:00:00Z');
    if (b.dataset.giorni) d.setUTCDate(d.getUTCDate() + Number(b.dataset.giorni));
    if (b.dataset.mesi) d.setUTCMonth(d.getUTCMonth() + Number(b.dataset.mesi));
    // sabato e domenica → lunedì
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    campo.value = d.toISOString().slice(0, 10);
  });
})();

document.querySelectorAll('form.elimina-attivita').forEach(f => f.addEventListener('submit', e => {
  if (!window.confirm('Eliminare questa attività?')) e.preventDefault();
}));

// Impostazioni → CRM: prima controlla il file (anteprima), poi importa
(() => {
  const controlla = document.getElementById('controlla-crm');
  if (!controlla) return;
  const conferma = document.getElementById('conferma-crm');
  const out = document.getElementById('esito-crm');
  const invia = async definitivo => {
    const f = document.getElementById('file-crm').files[0];
    if (!f) { out.textContent = 'Scegli prima il file.'; return; }
    controlla.disabled = conferma.disabled = true;
    out.textContent = definitivo ? 'Import in corso…' : 'Controllo del file…';
    const res = await fetch('/impostazioni/crm/importa' + (definitivo ? '?conferma=1' : ''), { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    controlla.disabled = conferma.disabled = false;
    if (!res.ok) { out.textContent = j.errore || 'Errore'; conferma.hidden = true; return; }
    const righe = [
      `${definitivo ? 'Importate' : 'Nel file'}: ${j.aziende} aziende (${j.nuove} nuove nel portale), ${j.contatti} referenti.`,
      j.daVerificare ? `${j.daVerificare} vanno nella lista "Da verificare" (fuori dalle ricerche finché non le confermi).` : '',
      j.collegate.length ? `Collegate ai clienti in anagrafica (${j.collegate.length}): ${j.collegate.map(c => `${c.azienda} → ${c.cliente} (${c.come})`).join('; ')}.` : '',
      j.conflitti.length ? `Da controllare: ${j.conflitti.join('; ')}.` : '',
    ];
    out.textContent = righe.filter(Boolean).join(' ');
    conferma.hidden = definitivo;
  };
  controlla.addEventListener('click', () => invia(false));
  conferma.addEventListener('click', () => invia(true));
})();
