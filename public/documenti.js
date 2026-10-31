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
  nuova.querySelectorAll('option[data-libero]').forEach(o => o.remove());
  nuova.querySelectorAll('input, select').forEach(el => {
    el.name = el.name.replace(/righe\[\d+\]/, `righe[${indice}]`);
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else if (el.type === 'checkbox') el.checked = false; else el.value = '';
    el.readOnly = false; delete el.dataset.listino;
  });
  nuova.querySelectorAll('.nota').forEach(el => el.remove());
  tabella.appendChild(nuova);
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
  scegliProdotto(riga, sel.selectedOptions[0]);
  const prezzo = campo(riga, 'prezzo');
  if (prezzo?.dataset.listino) prezzo.value = '';      // il prezzo del prodotto di prima non vale più
  prezzoDaListino(riga);
});
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
      o.label = [c.codice_gestionale, c.descrizione, c.prezzo != null ? `ultimo ${String(c.prezzo).replace('.', ',')} €` : ''].filter(Boolean).join(' · ');
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
