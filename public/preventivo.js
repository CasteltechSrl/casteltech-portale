// Pagina preventivo: ricalcolo automatico mentre si scrive, e salvataggio.
(() => {
  const form = document.getElementById('preventivo');
  const id = form.dataset.id || null;
  const statoEl = document.getElementById('stato-salvataggio');
  const eur = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const euro = n => eur.format(n || 0) + ' €';
  const ore = sec => { const m = Math.round((sec || 0) / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  let modificato = false;

  function raccogli() {
    const d = { parametri: {}, personeFase: {}, prezziMateriali: {}, tariffe: {} };
    form.querySelectorAll('[data-campo]').forEach(el => { d[el.dataset.campo] = el.value; });
    form.querySelectorAll('[data-id]').forEach(el => { d[el.dataset.id] = el.value; });
    const lati = form.querySelector('input[name=lati]:checked');
    if (lati) d.parametri.doppiaFaccia = lati.value;
    form.querySelectorAll('[data-param]').forEach(el => {
      if (el.type === 'checkbox') d.parametri[el.dataset.param] = el.checked ? 1 : 0;
      else if (el.type === 'radio') { if (el.checked) d.parametri[el.dataset.param] = el.value; }
      else if (el.value.trim() !== '') d.parametri[el.dataset.param] = el.value;
    });
    form.querySelectorAll('[data-persone]').forEach(el => { d.personeFase[el.dataset.persone] = el.value; });
    form.querySelectorAll('[data-materiale]').forEach(el => { d.prezziMateriali[el.dataset.materiale] = el.value; });
    form.querySelectorAll('[data-tariffa]').forEach(el => { d.tariffe[el.dataset.tariffa] = el.value; });
    return d;
  }

  function aggiorna({ risultato: r, nPCB, totaliHtml }) {
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
    // totali per gruppo (PRE-PRODUZIONE, SMD, THT…)
    const gruppi = {};
    for (const f of r.fasi) {
      const g = gruppi[f.gruppo] ??= { ciclo: 0, uomo: 0, costo: 0, prezzo: 0 };
      g.ciclo += f.secondiCiclo; g.uomo += f.secondiUomo; g.costo += f.costo; g.prezzo += f.prezzo;
    }
    form.querySelectorAll('tr.riga-gruppo').forEach(tr => {
      const g = gruppi[tr.dataset.gruppo] || { ciclo: 0, uomo: 0, costo: 0, prezzo: 0 };
      tr.querySelector('[data-v=ciclo]').textContent = ore(g.ciclo);
      tr.querySelector('[data-v=uomo]').textContent = ore(g.uomo);
      tr.querySelector('[data-v=costo]').textContent = euro(g.costo);
      tr.querySelector('[data-v=prezzo]').textContent = euro(g.prezzo);
      tr.classList.toggle('gruppo-vuoto', !g.ciclo);
    });
    for (const v of r.voci) {
      const tr = form.querySelector(`tr[data-voce="${CSS.escape(v.codice)}"]`);
      if (!tr) continue;
      tr.querySelector('[data-v=costo]').textContent = euro(v.costo);
      tr.querySelector('[data-v=prezzo]').textContent = euro(v.prezzo);
    }
    const t = r.totali;
    document.getElementById('totali').innerHTML = totaliHtml;
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

  // ── Cliente e codice solo dalle anagrafiche ──
  const selCliente = document.getElementById('sel-cliente');
  const selProdotto = document.getElementById('sel-prodotto');
  const descrizione = document.getElementById('descrizione');
  selCliente.addEventListener('change', async () => {
    document.getElementById('apri-nuovo-prodotto').disabled = !selCliente.value;
    selProdotto.innerHTML = '<option value="">Caricamento…</option>';
    descrizione.value = '';
    if (!selCliente.value) { selProdotto.innerHTML = '<option value="">— prima scegli il cliente —</option>'; return; }
    const elenco = await (await fetch('/preventivi/prodotti?cliente=' + encodeURIComponent(selCliente.value))).json();
    selProdotto.innerHTML = '';
    const vuota = new Option(elenco.length ? '— scegli il codice —' : 'Nessun prodotto per questo cliente (aggiungilo in Anagrafiche → Prodotti)', '');
    selProdotto.add(vuota);
    for (const p of elenco) {
      const o = new Option(p.codice + (p.da_assegnare ? ' (non assegnato)' : ''), p.id);
      o.dataset.descrizione = p.descrizione || '';
      selProdotto.add(o);
    }
  });
  selProdotto.addEventListener('change', () => {
    descrizione.value = selProdotto.selectedOptions[0]?.dataset.descrizione || '';
  });

  // ── Prodotto nuovo: codice non ancora in anagrafica, si aggiunge senza uscire dal preventivo ──
  // servono codice, descrizione e revisione (se il cliente non la indica: 0); tutto maiuscolo
  const nuovo = document.getElementById('nuovo-prodotto');
  const np = k => document.getElementById('np-' + k);
  const revisione = document.getElementById('revisione');
  document.getElementById('apri-nuovo-prodotto').addEventListener('click', () => {
    nuovo.hidden = false;
    if (!np('revisione').value && revisione.value) np('revisione').value = revisione.value;
    np('codice').focus();
  });
  np('annulla').addEventListener('click', () => { nuovo.hidden = true; np('esito').textContent = ''; });
  np('aggiungi').addEventListener('click', async () => {
    const esito = np('esito');
    esito.classList.add('negativo');
    const valori = { codice: np('codice').value.trim(), descrizione: np('descrizione').value.trim(), revisione: np('revisione').value.trim() };
    const mancano = [!valori.codice && 'il codice', !valori.descrizione && 'la descrizione', !valori.revisione && 'la revisione (se non è indicata scrivi 0)'].filter(Boolean);
    if (!selCliente.value) { esito.textContent = 'Scegli prima il cliente.'; return; }
    if (mancano.length) { esito.textContent = 'Manca ' + mancano.join(', ') + '.'; return; }
    esito.textContent = 'Salvataggio in anagrafica…';
    const res = await fetch('/preventivi/prodotti', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: selCliente.value, ...valori }) });
    const p = await res.json().catch(() => ({}));
    if (!res.ok) { esito.textContent = p.errore || 'Errore nel salvataggio'; return; }
    // il prodotto entra nell'elenco del cliente e viene scelto; la revisione va nel preventivo
    let o = [...selProdotto.options].find(x => x.value === String(p.id));
    if (!o) { o = new Option(p.codice, p.id); selProdotto.add(o); }
    o.dataset.descrizione = p.descrizione || '';
    selProdotto.value = String(p.id);
    descrizione.value = p.descrizione || '';
    revisione.value = p.revisione;
    nuovo.hidden = true;
    esito.textContent = '';
    modificato = true;
    statoEl.classList.remove('negativo');
    statoEl.textContent = p.esisteva ? `${p.codice} era già in anagrafica: scelto dall'elenco. Premi Salva.` : `${p.codice} aggiunto in anagrafica. Premi Salva.`;
  });

  // tutto in maiuscolo mentre si scrive
  form.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => {
    const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
  }));

  // ── Costo componenti dalla BOM caricata in Quotazioni ──
  // scegliendo la BOM (o cambiando le schede) il costo a scheda si ricalcola sulle schede del preventivo;
  // scrivendo il costo a mano il collegamento con la BOM si toglie
  const selBom = document.getElementById('sel-bom');
  const costoComp = form.querySelector('[data-param=costoComponentiScheda]');
  const esitoBom = document.getElementById('esito-bom');
  let timerBom;
  async function costoDaBom() {
    if (!selBom || !selBom.value || !costoComp) return;
    const schede = form.querySelector('[data-campo=nSchede]').value;
    esitoBom.textContent = 'Calcolo del costo dalla BOM…';
    const res = await fetch(`/preventivi/costo-bom?bom=${encodeURIComponent(selBom.value)}&schede=${encodeURIComponent(schede)}`);
    const x = await res.json().catch(() => ({}));
    if (!res.ok) { esitoBom.textContent = x.errore || 'Errore nel calcolo dalla BOM'; return; }
    costoComp.value = (Math.round(x.aScheda * 10000) / 10000).toString().replace('.', ',');
    const spuntaComp = casella('acquistoComponenti');
    if (spuntaComp && !spuntaComp.checked) { spuntaComp.checked = true; aggiornaDipendenze(); }
    const avvisi = [...(x.problemi || []), x.stato !== 'pronta' ? 'BOM non ancora elaborata del tutto' : ''].filter(Boolean);
    esitoBom.textContent = `Per ${x.schede} schede: ${euro(x.totale)}, cioè ${euro(x.aScheda)} a scheda` +
      ` (prezzi del ${new Date(x.prezziDel).toLocaleDateString('it-IT')})` + (avvisi.length ? ' · ' + avvisi.join(' · ') : '');
    esitoBom.classList.toggle('negativo', avvisi.length > 0);
    // problemi da risolvere: si va alla BOM quotata, che riporta qui al preventivo
    if (avvisi.length && id && x.stato === 'pronta') {
      const a = document.createElement('a');
      a.href = `/quotazioni/bom/${selBom.value}?preventivo=${encodeURIComponent(id)}`; a.className = 'bottone'; a.textContent = 'Risolvi nella BOM quotata';
      esitoBom.append(' ', a);
    }
    modificato = true; statoEl.textContent = 'Modifiche non salvate';
    ricalcola();
  }
  // preventivo dai documenti del cliente (Adriano 28/10/2026): spuntando "Componenti" la BOM del cliente si quota da sola
  // in Quotazioni; finita l'elaborazione il costo a scheda arriva qui (con i problemi da risolvere nella BOM)
  const attendiBom = async bomId => {
    for (let i = 0; i < 200; i++) {
      const s = await (await fetch(`/quotazioni/bom/${bomId}/stato`)).json().catch(() => ({}));
      if (!s.inCorso && s.stato !== 'da_elaborare' && s.stato !== 'in_corso') return;
      esitoBom.textContent = `BOM in quotazione${s.fase ? ': ' + s.fase : ''}…`;
      await new Promise(r => setTimeout(r, 3000));
    }
  };
  async function quotaBom() {
    if (!selBom || !selBom.dataset.pacchetto || selBom.value || !id) return;
    esitoBom.textContent = 'Quotazione della BOM del cliente…'; esitoBom.classList.remove('negativo');
    const res = await fetch(`/preventivi/${encodeURIComponent(id)}/quota-bom`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schede: form.querySelector('[data-campo=nSchede]').value }) });
    const x = await res.json().catch(() => ({}));
    if (!res.ok) { esitoBom.textContent = x.errore || 'Errore nella quotazione della BOM'; esitoBom.classList.add('negativo'); return; }
    if (![...selBom.options].some(o => o.value === String(x.bomId))) selBom.add(new Option(`${x.nome} (${new Date(x.creatoIl).toLocaleDateString('it-IT')})`, x.bomId));
    selBom.value = String(x.bomId);
    const apri = document.getElementById('apri-bom');
    apri.hidden = false; apri.querySelector('a').href = '/quotazioni/bom/' + x.bomId;
    modificato = true; statoEl.textContent = 'Modifiche non salvate';
    await attendiBom(x.bomId);
    costoDaBom();
  }
  if (selBom && new URLSearchParams(location.search).has('quota-bom') && selBom.value) costoDaBom();
  if (selBom) {
    selBom.addEventListener('change', () => {
      const apri = document.getElementById('apri-bom');
      apri.hidden = !selBom.value;
      apri.querySelector('a').href = '/quotazioni/bom/' + selBom.value;
      if (selBom.value) costoDaBom(); else { esitoBom.textContent = 'Costo componenti scritto a mano.'; esitoBom.classList.remove('negativo'); }
    });
    form.querySelector('[data-campo=nSchede]').addEventListener('input', () => { clearTimeout(timerBom); timerBom = setTimeout(costoDaBom, 500); });
    if (costoComp) costoComp.addEventListener('input', () => {
      if (!selBom.value) return;
      selBom.value = ''; document.getElementById('apri-bom').hidden = true;
      esitoBom.textContent = 'Costo scritto a mano: il collegamento con la BOM è stato tolto.'; esitoBom.classList.remove('negativo');
    });
  }

  // ── Solo TOP / TOP + BOT ──
  form.querySelectorAll('input[name=lati]').forEach(r => r.addEventListener('change', () => {
    const soloTop = r.value === '0' && r.checked;
    form.classList.toggle('solo-top', soloTop);
    form.querySelectorAll('.solo-bot input').forEach(el => {
      if (el.type === 'checkbox') { if (soloTop) el.checked = false; return; }
      // Solo TOP: i dati BOT vengono tolti. TOP + BOT: tornano i valori standard
      el.value = soloTop ? '' : (el.value || el.placeholder || '');
    });
    ricalcola();
  }));
  // ── Provenienza del materiale: con materiale da restituire niente etichettatura e stoccaggio ──
  form.querySelectorAll('input[name=provenienza]').forEach(r => r.addEventListener('change', () => {
    form.classList.toggle('materiale-da-restituire', r.checked && r.value === '1');
  }));
  // ── Informazioni generali: le sezioni e i campi che dipendono da una spunta compaiono solo se è messa ──
  // regola data-dipende: "a b" = servono a E b; "a|b" = basta a O b
  const spunta = cod => { const el = form.querySelector(`.spunte-generali [data-param="${cod}"]`); return !el || el.checked; };
  const aggiornaDipendenze = () => form.querySelectorAll('[data-dipende]').forEach(x => {
    x.hidden = !x.dataset.dipende.split(' ').every(g => g.split('|').some(spunta));
  });
  const casella = cod => form.querySelector(`.spunte-generali [data-param="${cod}"]`);
  form.querySelectorAll('.spunte-generali input[type=checkbox]').forEach(el => el.addEventListener('change', () => {
    // il lato BOT si monta insieme al TOP: BOT spunta anche TOP, togliere TOP toglie anche BOT
    if (el.dataset.param === 'doppiaFaccia' && el.checked && casella('presenteSmd')) casella('presenteSmd').checked = true;
    if (el.dataset.param === 'presenteSmd' && !el.checked && casella('doppiaFaccia')) casella('doppiaFaccia').checked = false;
    // AOI (Adriano 28/10/2026): segue i lati SMD (TOP con il TOP, BOT solo con il BOT); il controllo visivo sostituisce l'AOI
    const aoi = (cod, v) => { const c = casella(cod); if (c) c.checked = v; };
    const visivo = casella('controlloVisivo');
    if (el.dataset.param === 'presenteSmd' && !(visivo && visivo.checked)) { aoi('aoiTop', el.checked); if (!el.checked) aoi('aoiBot', false); }
    if (el.dataset.param === 'doppiaFaccia' && !(visivo && visivo.checked)) { aoi('aoiBot', el.checked); if (el.checked) aoi('aoiTop', true); }
    if (el.dataset.param === 'controlloVisivo') {
      if (el.checked) { aoi('aoiTop', false); aoi('aoiBot', false); }
      else { aoi('aoiTop', !!(casella('presenteSmd') && casella('presenteSmd').checked)); aoi('aoiBot', !!(casella('doppiaFaccia') && casella('doppiaFaccia').checked)); }
    }
    if ((el.dataset.param === 'aoiTop' || el.dataset.param === 'aoiBot') && el.checked) aoi('controlloVisivo', false);
    // 1ª produzione e variazione quantità si escludono
    if (el.dataset.param === 'primaProduzione' && el.checked && casella('variazioneQuantita')) casella('variazioneQuantita').checked = false;
    if (el.dataset.param === 'variazioneQuantita' && el.checked && casella('primaProduzione')) casella('primaProduzione').checked = false;
    // campionatura: ricarico al 35% (togliendo la spunta torna quello di prima)
    if (el.dataset.param === 'campionatura') {
      const ric = form.querySelector('[data-tariffa=ricarico]');
      if (el.checked) { ric.dataset.prima = ric.value; ric.value = '1.35'; }
      else if (ric.dataset.prima) ric.value = ric.dataset.prima;
    }
    // lamina: std oppure con trattamenti
    if (el.dataset.param === 'acquistoLamina' && el.checked && casella('laminaTrattamenti')) casella('laminaTrattamenti').checked = false;
    if (el.dataset.param === 'laminaTrattamenti' && el.checked && casella('acquistoLamina')) casella('acquistoLamina').checked = false;
    const doppia = casella('doppiaFaccia');
    if (doppia) form.classList.toggle('solo-top', !doppia.checked);
    aggiornaDipendenze();
    if (el.dataset.param === 'acquistoComponenti' && el.checked) quotaBom();
  }));
  // ── Durate: si scrivono come 1:30, 30', 1h, 1h30 e vengono mostrate come h:mm ──
  const leggiDurata = t => {
    t = String(t || '').trim().toLowerCase().replace(',', '.');
    if (!t) return null;
    let m = t.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] + m[2] / 60;
    m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*(?:'|m|min)?)?$/);
    if (m && (m[1] || m[2]) && /h|'|m/.test(t)) return +(m[1] || 0) + (m[2] || 0) / 60;
    const n = Number(t); return Number.isFinite(n) ? n : null;
  };
  const scriviDurata = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  form.querySelectorAll('input[data-tipo=durata]').forEach(el => el.addEventListener('blur', () => {
    const h = leggiDurata(el.value);
    if (h != null) el.value = scriviDurata(h);
  }));

  form.addEventListener('input', e => {
    if (e.target.form && e.target.form !== form) return;   // stato del preventivo: ha il suo modulo
    if (e.target.closest('#nuovo-prodotto')) return;        // prodotto nuovo: si salva con il suo pulsante
    modificato = true;
    statoEl.textContent = 'Modifiche non salvate';
    if (e.target.dataset.campo === 'prezzoTargetScheda') return aggiornaTarget();
    if (['revisione', 'note'].includes(e.target.dataset.campo) || e.target.dataset.id) return;
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
