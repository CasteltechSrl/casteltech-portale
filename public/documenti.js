// Righe dei documenti: fattura / nota di credito / DDT (Amministrazione), conferma d'ordine, ordine a fornitore.
// "+ Riga" aggiunge una riga vuota in fondo; codici in maiuscolo mentre si scrive.
const tabella = document.querySelector('#righe-documento tbody');
const moduloDoc = document.getElementById('modulo-documento');
const campo = (riga, n) => riga?.querySelector(`[name$="[${n}]"]`);
const numero = s => { let t = String(s ?? '').replace(/[€\s]/g, ''); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); return t ? Number(t) : NaN; };
const nomeDocumento = () => (document.querySelector('.intestazione-pagina h2, main h2') ?? document.querySelector('title'))?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? '';

document.getElementById('aggiungi-riga')?.addEventListener('click', () => {
  const ultima = tabella.lastElementChild;
  const nuova = ultima.cloneNode(true);
  const indice = tabella.children.length;
  nuova.className = '';
  nuova.hidden = false;
  nuova.querySelectorAll('option[data-libero]').forEach(o => o.remove());
  nuova.querySelectorAll('input, select').forEach(el => {
    el.name = el.name.replace(/righe\[\d+\]/, `righe[${indice}]`);
    if (el.tagName === 'SELECT') { el.selectedIndex = 0; if (el.dataset.predefinita) el.value = el.dataset.predefinita; }
    else if (el.type === 'checkbox') el.checked = false; else el.value = '';
    el.readOnly = false; delete el.dataset.listino;
  });
  nuova.querySelectorAll('.nota').forEach(el => el.remove());
  tabella.appendChild(nuova);
  const fonte = nuova.querySelector('select.fonte-riga');
  if (fonte) mostraFonte(nuova, fonte.value);
  (nuova.querySelector('select.scelta-prodotto') ?? nuova.querySelector('input[name$="[codice]"]') ?? nuova.querySelector('input[name$="[descrizione]"]'))?.focus();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.classList?.contains('maiuscolo')) return;
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
});

// ── Codice dall'anagrafica del cliente (Adriano 31/10/2026): menu con i soli prodotti del cliente, "+ Nuovo prodotto…" ──
const pannelloNuovo = document.getElementById('np-riga');
let rigaNuovo = null;            // riga che aspetta il prodotto nuovo
function scegliProdotto(riga, opzione) {
  const codice = campo(riga, 'codice'), descr = campo(riga, 'descrizione');
  if (codice) codice.value = opzione?.dataset.codice ?? '';
  if (!descr) return;
  // servizio una tantum (UT-…, uguale per tutti i clienti): descrizione proposta ma modificabile, prezzo proposto se la casella è vuota
  if (opzione?.dataset.servizio) {
    if (!descr.value.trim() || descr.readOnly || descr.dataset.servizio) descr.value = opzione.dataset.descrizione || '';
    descr.readOnly = false; descr.title = 'Descrizione proposta dal servizio una tantum: si può completare';
    descr.dataset.servizio = '1';
    const prezzo = campo(riga, 'prezzo');
    if (prezzo && opzione.dataset.prezzo && (!prezzo.value.trim() || prezzo.dataset.listino)) {
      prezzo.value = opzione.dataset.prezzo.replace('.', ','); prezzo.dataset.listino = '1'; prezzo.title = 'Prezzo proposto dal servizio una tantum';
    }
    return;
  }
  delete descr.dataset.servizio;
  if (opzione?.value && opzione.value !== 'nuovo') {
    descr.value = opzione.dataset.descrizione || descr.value;
    descr.readOnly = true;
    descr.title = "Descrizione dall'anagrafica del prodotto (si cambia in Anagrafiche → Prodotti)";
  } else { descr.readOnly = false; descr.title = ''; }
}
moduloDoc?.addEventListener('change', e => {
  const sel = e.target;
  if (!sel.classList?.contains('scelta-prodotto')) return;
  const riga = sel.closest('tr');
  if (sel.value === 'nuovo') {
    rigaNuovo = riga;
    sel.selectedIndex = [...sel.options].findIndex(o => o.dataset.codice === (campo(riga, 'codice')?.value ?? '') && o.value !== 'nuovo');
    if (sel.selectedIndex < 0) sel.selectedIndex = 0;
    if (pannelloNuovo) { pannelloNuovo.hidden = false; document.getElementById('np-riga-codice').focus(); }
    return;
  }
  const opzione = sel.selectedOptions[0], codicePrima = campo(riga, 'codice')?.value ?? '';
  // riga che ha già descrizione o prezzo e codice diverso: si chiede cosa sostituire (Adriano 9/11/2026, DDT 222)
  if (domandaSost && opzione?.dataset.codice && opzione.dataset.codice !== codicePrima && rigaConDati(riga)) {
    chiediSostituzione(riga, sel, opzione, codicePrima);
    return;
  }
  const prezzo = campo(riga, 'prezzo');
  if (prezzo?.dataset.listino) prezzo.value = '';      // il prezzo del prodotto di prima non vale più
  scegliProdotto(riga, opzione);
  prezzoDaListino(riga);
});

// ── Codice scelto su una riga già scritta (Adriano 9/11/2026): solo il codice, oppure anche descrizione e/o prezzo ──
const domandaSost = document.getElementById('domanda-sostituisci');
let sostituzione = null;         // { riga, sel, opzione, codicePrima }
function rigaConDati(riga) {
  return !!(campo(riga, 'descrizione')?.value.trim() || campo(riga, 'prezzo')?.value.trim());
}
function chiediSostituzione(riga, sel, opzione, codicePrima) {
  sostituzione = { riga, sel, opzione, codicePrima };
  const n = [...tabella.children].indexOf(riga) + 1;
  document.getElementById('domanda-sostituisci-testo').textContent =
    `Riga ${n}: hai scelto ${opzione.dataset.codice}${codicePrima ? ' al posto di ' + codicePrima : ''}, ma la riga è già compilata. Cosa sostituisco oltre al codice?`;
  const nuova = opzione.dataset.descrizione || '';
  document.getElementById('sostituisci-descrizione-nuova').textContent = nuova ? `(diventa: ${nuova})` : '';
  document.getElementById('sostituisci-descrizione').checked = true;
  document.getElementById('sostituisci-prezzo').checked = false;
  domandaSost.hidden = false;
  domandaSost.scrollIntoView({ block: 'nearest' });
}
/** Applica il codice scelto alla riga; descrizione e prezzo di prima restano se non vanno sostituiti. */
function applicaScelta(riga, opzione, { descrizione = true, prezzo = true } = {}) {
  const casPrezzo = campo(riga, 'prezzo'), descr = campo(riga, 'descrizione');
  const prezzoPrima = casPrezzo?.value ?? '', descrPrima = descr?.value ?? '';
  if (prezzo && casPrezzo) { casPrezzo.value = ''; delete casPrezzo.dataset.listino; }
  if (descrizione && descr) { descr.value = ''; delete descr.dataset.servizio; }
  scegliProdotto(riga, opzione);
  if (!descrizione && descr) {
    descr.value = descrPrima; descr.readOnly = false;
    descr.title = "Descrizione tenuta com'era: vale solo per questo documento, l'anagrafica non cambia";
  }
  if (!prezzo && casPrezzo) { casPrezzo.value = prezzoPrima; delete casPrezzo.dataset.listino; }   // resta come scritto
  else prezzoDaListino(riga);
}
function chiudiSostituzione(esito) {
  if (!sostituzione) return;
  const { riga, sel, opzione, codicePrima } = sostituzione;
  sostituzione = null;
  domandaSost.hidden = true;
  if (esito === 'annulla') {
    const i = [...sel.options].findIndex(o => o.dataset.codice === codicePrima && o.value !== 'nuovo');
    sel.selectedIndex = i < 0 ? 0 : i;
  } else {
  applicaScelta(riga, opzione, esito === 'solo' ? { descrizione: false, prezzo: false }
    : { descrizione: document.getElementById('sostituisci-descrizione').checked, prezzo: document.getElementById('sostituisci-prezzo').checked });
  }
  moduloDoc?.dispatchEvent(new Event('input', { bubbles: true }));   // l'autosalvataggio vede la modifica
}
document.getElementById('sostituisci-applica')?.addEventListener('click', () => chiudiSostituzione('applica'));
document.getElementById('sostituisci-solo-codice')?.addEventListener('click', () => chiudiSostituzione('solo'));
document.getElementById('sostituisci-annulla')?.addEventListener('click', () => chiudiSostituzione('annulla'));
if (pannelloNuovo) {
  const np = k => document.getElementById('np-riga-' + k);
  const chiudi = () => { pannelloNuovo.hidden = true; np('esito').textContent = ''; np('codice').value = ''; np('descrizione').value = ''; };
  np('annulla').addEventListener('click', chiudi);
  pannelloNuovo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); np('aggiungi').click(); } });
  np('aggiungi').addEventListener('click', async () => {
    const esito = np('esito');
    esito.classList.add('negativo');
    const valori = { codice: np('codice').value.trim(), descrizione: np('descrizione').value.trim() };
    if (!valori.codice || !valori.descrizione) { esito.textContent = 'Servono codice e descrizione.'; return; }
    esito.textContent = 'Salvataggio in anagrafica…';
    const res = await fetch('/preventivi/prodotti', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: pannelloNuovo.dataset.cliente, ...valori, revisione: '0' }) }).catch(() => null);
    const p = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { esito.textContent = p.errore || 'Errore nel salvataggio'; return; }
    // il prodotto entra nel menu di tutte le righe (prima di "+ Nuovo prodotto…") e si sceglie nella riga
    document.querySelectorAll('select.scelta-prodotto').forEach(sel => {
      if ([...sel.options].some(o => o.value === String(p.id))) return;
      const o = new Option(p.codice, p.id);
      o.dataset.codice = p.codice; o.dataset.descrizione = p.descrizione || '';
      sel.insertBefore(o, sel.querySelector('option[value="nuovo"]'));
    });
    const sel = rigaNuovo?.querySelector('select.scelta-prodotto');
    if (sel) { sel.value = String(p.id); scegliProdotto(rigaNuovo, sel.selectedOptions[0]); prezzoDaListino(rigaNuovo); }
    chiudi();
  });
}

// ── Listino a scaglioni (Adriano 31/10/2026): prodotto + quantità → prezzo dello scaglione giusto ──
// Si riempie solo una casella prezzo vuota o già riempita da qui (data-listino); un prezzo scritto a mano resta.
async function prezzoDaListino(riga) {
  const prodotto = campo(riga, 'prodotto_id'), quantita = campo(riga, 'quantita'), prezzo = campo(riga, 'prezzo');
  if (!prezzo || !/^\d+$/.test(prodotto?.value ?? '')) return;
  if (prezzo.value.trim() && !prezzo.dataset.listino) return;
  const qs = new URLSearchParams({ quantita: quantita?.value || '1' });
  const res = await fetch(`/anagrafiche/prodotti/${prodotto.value}/listino?${qs}`).catch(() => null);
  const j = res?.ok ? await res.json().catch(() => ({})) : {};
  if (j.prezzo == null) { if (prezzo.dataset.listino) prezzo.value = ''; return; }
  prezzo.value = String(j.prezzo).replace('.', ',');
  prezzo.dataset.listino = '1';
  prezzo.title = j.scaglione ? `Prezzo di listino per ${j.scaglione}` : 'Prezzo di listino';
}
moduloDoc?.addEventListener('change', e => {
  if (/\[quantita\]$/.test(e.target.name ?? '')) prezzoDaListino(e.target.closest('tr'));
});
document.querySelectorAll('#righe-documento tbody tr').forEach(riga => { if (!campo(riga, 'prezzo')?.value.trim()) prezzoDaListino(riga); });

// ── Prezzo cambiato a mano → "aggiorno l'anagrafica?" (prodotto: scaglione o prezzo unico; componente: ultimo acquisto) ──
const domanda = document.getElementById('domanda-prezzo');
let inSospeso = null;            // { url, corpo } dell'aggiornamento proposto
moduloDoc?.addEventListener('input', e => { if (/\[prezzo\]$/.test(e.target.name ?? '')) delete e.target.dataset.listino; });
moduloDoc?.addEventListener('change', async e => {
  if (!domanda || !/\[prezzo\]$/.test(e.target.name ?? '') || e.target.dataset.listino) return;
  const riga = e.target.closest('tr');
  const prezzo = numero(e.target.value), quantita = numero(campo(riga, 'quantita')?.value) || 1;
  if (!(prezzo >= 0)) return;
  const prodotto = campo(riga, 'prodotto_id')?.value, codice = campo(riga, 'codice')?.value?.trim();
  let testo = null;
  if (/^\d+$/.test(prodotto ?? '')) {
    const res = await fetch(`/anagrafiche/prodotti/${prodotto}/listino?${new URLSearchParams({ quantita, prezzo })}`).catch(() => null);
    testo = res?.ok ? (await res.json().catch(() => ({}))).domanda : null;
    inSospeso = { url: `/anagrafiche/prodotti/${prodotto}/prezzo-da-documento`, corpo: { quantita, prezzo, documento: nomeDocumento() } };
  } else if (codice && riga.querySelector('input.cerca-componente')) {
    const res = await fetch(`/anagrafiche/componenti-prezzo?${new URLSearchParams({ codice, prezzo })}`).catch(() => null);
    testo = res?.ok ? (await res.json().catch(() => ({}))).domanda : null;
    const fornitore = moduloDoc.querySelector('select[name="fornitore_id"]')?.selectedOptions[0];
    inSospeso = { url: '/anagrafiche/componenti-prezzo', corpo: { codice, prezzo, quantita, fornitore: fornitore?.value ? fornitore.textContent.trim() : '', documento: nomeDocumento() } };
  }
  document.getElementById('domanda-prezzo-esito').textContent = '';
  if (!testo) { domanda.hidden = true; inSospeso = null; return; }
  document.getElementById('domanda-prezzo-testo').textContent = testo;
  domanda.hidden = false;
});
document.getElementById('domanda-prezzo-no')?.addEventListener('click', () => { domanda.hidden = true; inSospeso = null; });
document.getElementById('domanda-prezzo-si')?.addEventListener('click', async () => {
  if (!inSospeso) return;
  const esito = document.getElementById('domanda-prezzo-esito');
  const res = await fetch(inSospeso.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inSospeso.corpo) }).catch(() => null);
  const j = res ? await res.json().catch(() => ({})) : {};
  if (!res?.ok) { esito.textContent = j.errore || 'Anagrafica non aggiornata'; return; }
  inSospeso = null;
  domanda.hidden = true;
  const avviso = document.createElement('p');
  avviso.className = 'nota'; avviso.textContent = j.messaggio;
  domanda.after(avviso);
  setTimeout(() => avviso.remove(), 6000);
});

// ── Ordine a fornitore: P/N dall'archivio dei componenti mentre si scrive ──
const trovati = document.getElementById('componenti-trovati');
const ultimiTrovati = new Map();
let attesa = null;
moduloDoc?.addEventListener('input', e => {
  const el = e.target;
  if (!trovati || !el.classList?.contains('cerca-componente')) return;
  clearTimeout(attesa);
  attesa = setTimeout(async () => {
    const t = el.value.trim();
    if (t.length < 3) return;
    const res = await fetch('/anagrafiche/componenti-cerca?q=' + encodeURIComponent(t)).catch(() => null);
    const elenco = res?.ok ? await res.json().catch(() => []) : [];
    trovati.innerHTML = '';
    for (const c of elenco) {
      const codice = (c.pn || c.codice_gestionale || '').toUpperCase();
      if (!codice) continue;
      ultimiTrovati.set(codice, c);
      const o = document.createElement('option');
      o.value = codice;
      o.label = [c.codice_gestionale, c.codice_produzione, c.descrizione, c.prezzo != null ? `ultimo ${String(c.prezzo).replace('.', ',')} €` : ''].filter(Boolean).join(' · ');
      trovati.appendChild(o);
    }
  }, 250);
});
moduloDoc?.addEventListener('change', e => {
  const el = e.target;
  if (!el.classList?.contains('cerca-componente')) return;
  const c = ultimiTrovati.get(el.value.trim().toUpperCase());
  if (!c) return;
  const riga = el.closest('tr'), descr = campo(riga, 'descrizione'), prezzo = campo(riga, 'prezzo');
  if (descr && !descr.value.trim()) descr.value = String(c.descrizione ?? '').toUpperCase();
  if (prezzo && (!prezzo.value.trim() || prezzo.dataset.listino) && c.prezzo != null) {
    prezzo.value = String(c.prezzo).replace('.', ',');
    prezzo.dataset.listino = '1';
    prezzo.title = `Ultimo acquisto${c.fornitore ? ' da ' + c.fornitore : ''}`;
  }
});

// ── DDT: da quale anagrafica viene il codice della riga (Adriano 2/11/2026) ──
// Prodotto = menu dei prodotti del cliente; Componente nostro = archivio Componenti (P/N, gestionale, produzione);
// Componente cliente = Anagrafiche → Componenti clienti del cliente del DDT; Libero = codice e descrizione a mano.
const SEGNAPOSTO = { componente: 'cerca P/N, gestionale o produzione', componente_cliente: 'cerca codice o descrizione', libero: 'codice (facoltativo)' };
const ultimiRiga = new Map();
function mostraFonte(riga, fonte) {
  const perProdotto = riga.querySelector('.per-prodotto'), perTesto = riga.querySelector('.per-testo');
  if (perProdotto) perProdotto.hidden = fonte !== 'prodotto';
  if (perTesto) perTesto.hidden = fonte === 'prodotto';
  const testo = campo(riga, 'codice_testo');
  if (testo) testo.placeholder = SEGNAPOSTO[fonte] ?? '';
}
moduloDoc?.addEventListener('change', e => {
  const sel = e.target;
  if (!sel.classList?.contains('fonte-riga')) return;
  const riga = sel.closest('tr');
  mostraFonte(riga, sel.value);
  chiudiElenco();
  // la riga cambia anagrafica: via i collegamenti di prima
  ['componente_id', 'componente_cliente_id', 'codice_testo', 'codice'].forEach(n => { const el = campo(riga, n); if (el) el.value = ''; });
  const prodotto = riga.querySelector('select.scelta-prodotto');
  if (prodotto) prodotto.selectedIndex = 0;
  const descr = campo(riga, 'descrizione');
  if (descr?.readOnly) { descr.value = ''; descr.readOnly = false; descr.title = ''; }
  (sel.value === 'prodotto' ? prodotto : campo(riga, 'codice_testo'))?.focus();
});

// Elenco dei codici sotto la casella (al posto del datalist del browser, che spesso non prendeva il clic; Adriano 2/11/2026):
// clic, oppure frecce + Invio; in fondo "+ Nuovo…" per il codice che non c'è.
let elenco = null, casellaElenco = null, attivo = -1, attesaRiga = null;
function chiudiElenco() { elenco?.remove(); elenco = null; casellaElenco = null; attivo = -1; }
function evidenzia(n) {
  const voci = elenco ? [...elenco.querySelectorAll('li')] : [];
  if (!voci.length) return;
  attivo = (n + voci.length) % voci.length;
  voci.forEach((v, i) => v.classList.toggle('attiva', i === attivo));
  voci[attivo].scrollIntoView({ block: 'nearest' });
}
function scegliCodice(el, c) {
  const riga = el.closest('tr'), fonte = campo(riga, 'fonte')?.value, descr = campo(riga, 'descrizione');
  const id = campo(riga, fonte === 'componente' ? 'componente_id' : 'componente_cliente_id');
  el.value = c.codice;
  if (id) id.value = c.id;
  if (descr) { descr.value = c.descrizione || c.codice; descr.readOnly = true; descr.title = "Descrizione dall'anagrafica"; }
  chiudiElenco();
  el.dispatchEvent(new Event('change', { bubbles: true }));   // salvataggio automatico delle bozze
  campo(riga, 'quantita')?.focus();
}
async function nuovoCodice(el, fonte) {
  const scritto = el.value.trim().toUpperCase();
  chiudiElenco();
  if (fonte === 'componente') {   // i nostri componenti si codificano in Anagrafiche → Componenti (codice di produzione e gestionale)
    window.open('/anagrafiche/componenti?q=' + encodeURIComponent(scritto) + '#aggiungi-componente', '_blank', 'noopener');
    return;
  }
  const cliente = document.getElementById('righe-documento')?.dataset.cliente ?? '';
  if (!cliente) { alert('Scegli prima il cliente del DDT.'); return; }
  const codice = (window.prompt('Codice del componente del cliente (nuovo):', scritto) ?? '').trim();
  if (!codice) return;
  const descrizione = (window.prompt(`Descrizione di ${codice.toUpperCase()}:`, campo(el.closest('tr'), 'descrizione')?.value ?? '') ?? '').trim();
  const res = await fetch('/anagrafiche/componenti-clienti/nuovo-riga', { method: 'POST',
    body: new URLSearchParams({ cliente_id: cliente, codice, descrizione }) }).catch(() => null);
  const dati = res ? await res.json().catch(() => null) : null;
  if (!res?.ok || !dati?.id) { alert(dati?.errore ?? 'Componente non aggiunto: riprova.'); return; }
  scegliCodice(el, dati);
}
function apriElenco(el, fonte, voci) {
  chiudiElenco();
  elenco = document.createElement('ul');
  elenco.className = 'elenco-trovati';
  casellaElenco = el;
  for (const c of voci) {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = c.codice;
    li.append(b, document.createTextNode(c.descrizione ? '  ' + c.descrizione : ''));
    li.addEventListener('mousedown', ev => { ev.preventDefault(); scegliCodice(el, c); });
    elenco.appendChild(li);
  }
  const nuovo = document.createElement('li');
  nuovo.className = 'nuovo';
  nuovo.textContent = fonte === 'componente' ? `+ Nuovo componente${el.value.trim() ? ' «' + el.value.trim() + '»' : ''}: codificalo in Anagrafiche → Componenti`
    : `+ Nuovo componente del cliente${el.value.trim() ? ' «' + el.value.trim().toUpperCase() + '»' : ''}`;
  nuovo.addEventListener('mousedown', ev => { ev.preventDefault(); nuovoCodice(el, fonte); });
  elenco.appendChild(nuovo);
  if (!voci.length) { const v = document.createElement('li'); v.className = 'vuoto'; v.textContent = 'Nessun codice trovato.'; elenco.prepend(v); }
  const r = el.getBoundingClientRect();
  Object.assign(elenco.style, { left: `${r.left + window.scrollX}px`, top: `${r.bottom + window.scrollY}px`, minWidth: `${Math.max(r.width, 320)}px` });
  document.body.appendChild(elenco);
  evidenzia(voci.length ? 0 : elenco.children.length - 1);
}
moduloDoc?.addEventListener('input', e => {
  const el = e.target;
  if (!el.classList?.contains('cerca-riga')) return;
  const riga = el.closest('tr'), fonte = campo(riga, 'fonte')?.value;
  // codice cambiato a mano: il collegamento di prima non vale più (il portale lo ricerca per codice quando si salva)
  const id = campo(riga, fonte === 'componente' ? 'componente_id' : 'componente_cliente_id');
  if (id) id.value = '';
  const descr = campo(riga, 'descrizione');
  if (descr?.readOnly) { descr.readOnly = false; descr.title = ''; }
  if (fonte !== 'componente' && fonte !== 'componente_cliente') { chiudiElenco(); return; }
  clearTimeout(attesaRiga);
  attesaRiga = setTimeout(async () => {
    const t = el.value.trim();
    if (t.length < 2) { chiudiElenco(); return; }
    const cliente = document.getElementById('righe-documento')?.dataset.cliente ?? '';
    const url = fonte === 'componente' ? '/anagrafiche/componenti-ddt?q=' + encodeURIComponent(t)
      : `/anagrafiche/componenti-clienti-cerca?cliente=${encodeURIComponent(cliente)}&q=${encodeURIComponent(t)}`;
    const res = await fetch(url).catch(() => null);
    const voci = (res?.ok ? await res.json().catch(() => []) : []).filter(c => c.codice);
    for (const c of voci) ultimiRiga.set(fonte + '|' + c.codice, c);
    if (document.activeElement === el && el.value.trim() === t) apriElenco(el, fonte, voci);
  }, 250);
});
moduloDoc?.addEventListener('keydown', e => {
  const el = e.target;
  if (!el.classList?.contains('cerca-riga') || !elenco || casellaElenco !== el) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); evidenzia(attivo + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); evidenzia(attivo - 1); }
  else if (e.key === 'Escape') { e.preventDefault(); chiudiElenco(); }
  else if (e.key === 'Enter') {   // Invio sceglie la voce evidenziata (non manda il modulo)
    e.preventDefault();
    elenco.querySelectorAll('li')[attivo]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }
});
moduloDoc?.addEventListener('focusout', e => {
  if (e.target === casellaElenco) setTimeout(() => { if (document.activeElement !== casellaElenco) chiudiElenco(); }, 150);
  const el = e.target;
  if (!el.classList?.contains('cerca-riga')) return;
  // scritto per intero e uguale a un codice dell'elenco: lo prende come se fosse stato cliccato
  const riga = el.closest('tr'), fonte = campo(riga, 'fonte')?.value;
  const id = campo(riga, fonte === 'componente' ? 'componente_id' : 'componente_cliente_id');
  const c = ultimiRiga.get(fonte + '|' + el.value.trim().toUpperCase());
  if (c && id && !id.value) scegliCodice(el, c);
});
window.addEventListener('resize', chiudiElenco);

// ✕ toglie la riga (Adriano 2/11/2026): si svuota e si nasconde, al salvataggio non c'è più
moduloDoc?.addEventListener('click', e => {
  const b = e.target.closest?.('.togli-riga');
  if (!b) return;
  const riga = b.closest('tr');
  riga.querySelectorAll('input, select').forEach(el => {
    if (el.tagName === 'SELECT') { el.selectedIndex = 0; if (el.dataset.predefinita) el.value = el.dataset.predefinita; }
    else if (el.type === 'checkbox') el.checked = false; else el.value = '';
  });
  riga.hidden = true;
  if (![...tabella.children].some(r => !r.hidden)) document.getElementById('aggiungi-riga')?.click();
  moduloDoc.dispatchEvent(new Event('change'));
});
