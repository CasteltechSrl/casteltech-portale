// Pagina preventivo: ricalcolo automatico mentre si scrive, e salvataggio.
(() => {
  const form = document.getElementById('preventivo');
  const id = form.dataset.id || null;
  const statoEl = document.getElementById('stato-salvataggio');
  const eur = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const euro = n => eur.format(n || 0) + ' €';
  const ore = sec => { const m = Math.round((sec || 0) / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  let modificato = false;

  function raccogli() {
    const d = { parametri: {}, personeFase: {}, prezziMateriali: {}, tariffe: {} };
    form.querySelectorAll('[data-campo]').forEach(el => { d[el.dataset.campo] = el.value; });
    form.querySelectorAll('[data-param]').forEach(el => {
      if (el.type === 'checkbox') d.parametri[el.dataset.param] = el.checked ? 1 : 0;
      else if (el.value.trim() !== '') d.parametri[el.dataset.param] = el.value;
    });
    form.querySelectorAll('[data-persone]').forEach(el => { d.personeFase[el.dataset.persone] = el.value; });
    form.querySelectorAll('[data-materiale]').forEach(el => { d.prezziMateriali[el.dataset.materiale] = el.value; });
    form.querySelectorAll('[data-tariffa]').forEach(el => { d.tariffe[el.dataset.tariffa] = el.value; });
    return d;
  }

  function aggiorna({ risultato: r, nPCB }) {
    document.getElementById('nPCB').textContent = nPCB;
    for (const f of r.fasi) {
      const tr = form.querySelector(`tr[data-fase="${CSS.escape(f.codice)}"]`);
      if (!tr) continue;
      tr.classList.toggle('zero', !f.secondiCiclo);
      tr.querySelector('[data-v=ciclo]').textContent = ore(f.secondiCiclo);
      tr.querySelector('[data-v=uomo]').textContent = ore(f.secondiUomo);
      tr.querySelector('[data-v=costo]').textContent = euro(f.costo);
      tr.querySelector('[data-v=prezzo]').textContent = euro(f.prezzo);
    }
    for (const v of r.voci) {
      const tr = form.querySelector(`tr[data-voce="${CSS.escape(v.codice)}"]`);
      if (!tr) continue;
      tr.querySelector('[data-v=costo]').textContent = euro(v.costo);
      tr.querySelector('[data-v=prezzo]').textContent = euro(v.prezzo);
    }
    const t = r.totali;
    const set = (k, testo) => { const el = form.querySelector(`[data-t="${k}"]`); if (el) el.textContent = testo; };
    set('totalePrimoLotto', euro(t.totalePrimoLotto));
    set('prezzoSchedaPrimoLotto', euro(t.prezzoSchedaPrimoLotto) + ' a scheda');
    set('totaleSecondoLotto', euro(t.totaleSecondoLotto));
    set('prezzoSchedaSecondoLotto', euro(t.prezzoSchedaSecondoLotto) + ' a scheda');
    set('costiUnaTantum', euro(t.costiUnaTantum));
    set('guadagnoLotto', euro(t.guadagnoLotto));
    set('ore', `${ore(t.secondiCicloPrimoLotto)} / ${ore(t.secondiUomoPrimoLotto)}`);
    set('prezzoOrarioMedio', euro(t.prezzoOrarioMedio) + ' per ora di ciclo');
    aggiornaTarget(t.prezzoSchedaSecondoLotto);
  }

  let ultimoPrezzoScheda = null;
  function aggiornaTarget(prezzoScheda) {
    if (prezzoScheda != null) ultimoPrezzoScheda = prezzoScheda;
    const out = document.getElementById('diff-target');
    const target = parseFloat((form.querySelector('[data-campo=prezzoTargetScheda]').value || '').replace(',', '.'));
    if (!target || !ultimoPrezzoScheda) { out.textContent = ''; return; }
    const diff = (target / ultimoPrezzoScheda - 1) * 100;
    out.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% rispetto al nostro prezzo dei lotti successivi`;
    out.className = diff >= 0 ? 'positivo' : 'negativo';
  }

  let timer, richiesta = 0;
  function ricalcola() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const n = ++richiesta;
      const res = await fetch('/preventivi/calcola', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, dati: raccogli() }) });
      if (res.ok && n === richiesta) aggiorna(await res.json());
    }, 250);
  }

  form.addEventListener('input', e => {
    modificato = true;
    statoEl.textContent = 'Modifiche non salvate';
    if (e.target.dataset.campo === 'prezzoTargetScheda') return aggiornaTarget();
    if (['cliente', 'codice', 'revisione', 'descrizione', 'note'].includes(e.target.dataset.campo)) return;
    ricalcola();
  });
  form.addEventListener('submit', e => e.preventDefault());

  document.getElementById('mostra-tutte').addEventListener('change', e => {
    document.getElementById('tabella-fasi').classList.toggle('mostra-zero', e.target.checked);
  });

  document.getElementById('salva').addEventListener('click', async () => {
    statoEl.textContent = 'Salvataggio…';
    const res = await fetch('/preventivi/salva', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, dati: raccogli() }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { statoEl.textContent = j.errore || 'Errore nel salvataggio'; statoEl.classList.add('negativo'); return; }
    modificato = false;
    if (!id) { location.href = '/preventivi/' + j.id; return; }
    statoEl.classList.remove('negativo');
    statoEl.textContent = 'Salvato ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  });

  window.addEventListener('beforeunload', e => { if (modificato) e.preventDefault(); });
  aggiornaTarget(null);
  // Invio non deve inviare il form; passa al campo successivo
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      const campi = [...form.querySelectorAll('input:not([type=checkbox]), textarea')].filter(x => x.offsetParent);
      const i = campi.indexOf(e.target);
      if (campi[i + 1]) campi[i + 1].focus();
    }
  });
})();
