// Amministrazione → bozza di fattura / nota di credito: "+ Riga" aggiunge una riga vuota in fondo; codici in maiuscolo mentre si scrive
const tabella = document.querySelector('#righe-documento tbody');
document.getElementById('aggiungi-riga')?.addEventListener('click', () => {
  const ultima = tabella.lastElementChild;
  const nuova = ultima.cloneNode(true);
  const indice = tabella.children.length;
  nuova.className = '';
  nuova.querySelectorAll('input, select').forEach(el => {
    el.name = el.name.replace(/righe\[\d+\]/, `righe[${indice}]`);
    if (el.type === 'checkbox') el.checked = false; else el.value = '';
  });
  nuova.querySelectorAll('.nota').forEach(el => el.remove());
  tabella.appendChild(nuova);
  nuova.querySelector('input[name$="[descrizione]"]').focus();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.classList?.contains('maiuscolo')) return;
  const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p);
});
// Listino a scaglioni (Adriano 31/10/2026): codice + quantità → prezzo dello scaglione giusto.
// Si riempie solo una casella prezzo vuota o già riempita da qui (data-listino); un prezzo scritto a mano resta.
const moduloDoc = document.getElementById('modulo-documento');
const idDoc = /\/amministrazione\/documenti\/(\d+)/.exec(moduloDoc?.getAttribute('action') ?? '')?.[1];
async function prezzoDaListino(riga) {
  const campo = n => riga.querySelector(`input[name$="[${n}]"]`);
  const codice = campo('codice'), quantita = campo('quantita'), prezzo = campo('prezzo'), descr = campo('descrizione'), prodotto = campo('prodotto_id');
  if (!codice || !prezzo || !codice.value.trim()) return;
  if (prezzo.value.trim() && !prezzo.dataset.listino) return;
  const qs = new URLSearchParams({ codice: codice.value.trim(), quantita: quantita?.value || '1', prodotto_id: prodotto?.value || '' });
  const res = await fetch(`/amministrazione/documenti/${idDoc}/prezzo?${qs}`).catch(() => null);
  const j = res?.ok ? await res.json().catch(() => ({})) : {};
  if (j.prezzo == null) return;
  prezzo.value = String(j.prezzo).replace('.', ',');
  prezzo.dataset.listino = '1';
  prezzo.title = j.scaglione ? `Prezzo di listino per ${j.scaglione}` : 'Prezzo di listino';
  if (prodotto && !prodotto.value) prodotto.value = j.prodotto_id;
  if (descr && !descr.value.trim() && j.descrizione) descr.value = j.descrizione;
}
if (idDoc) {
  moduloDoc.addEventListener('change', e => {
    const el = e.target;
    if (!/\[(codice|quantita)\]$/.test(el.name ?? '')) return;
    // codice cambiato: il prodotto di prima non vale più
    if (/\[codice\]$/.test(el.name)) { const p = el.closest('tr').querySelector('input[name$="[prodotto_id]"]'); if (p && el.closest('tr').querySelector('input[name$="[prezzo]"]').dataset.listino) p.value = ''; }
    prezzoDaListino(el.closest('tr'));
  });
  // prezzo scritto a mano: non lo si tocca più
  moduloDoc.addEventListener('input', e => { if (/\[prezzo\]$/.test(e.target.name ?? '')) delete e.target.dataset.listino; });
}
