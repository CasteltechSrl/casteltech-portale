/**
 * Caricamento dei prezzi da Fatture in Cloud in Anagrafiche (Adriano 31/10/2026): prezzo di vendita dei prodotti e ultimo
 * prezzo di acquisto dei componenti. Il file lo prepara Claude con tools/prezzi-da-fic.ts. Prima un riepilogo, poi la conferma;
 * si può ricaricare: i prezzi scritti a mano dall'ufficio (fonte 'manuale') non si toccano.
 */
import { q, transazione } from './db.js';
import { abbinaProdotti, abbinaComponenti, chiave, type FilePrezzi } from '../engine/prezzi-fic.js';
import { prezzoPerQuantita, type Scaglione } from '../engine/listino.js';

export async function caricaPrezzi(f: FilePrezzi, opz: { anteprima: boolean }) {
  const [prodotti, clienti, aliasClienti, aliasProdotti, componenti] = await Promise.all([
    q<any>(`SELECT id, codice, cliente_id, prezzo_fonte FROM prodotti`),
    q<any>(`SELECT id, ragione_sociale FROM clienti`),
    q<any>(`SELECT nome, cliente_id FROM alias_clienti`),
    q<any>(`SELECT cliente_id, codice, prodotto_id FROM alias_prodotti`),
    q<any>(`SELECT id, pn_key, codice_produzione, codice_gestionale, prezzo_fonte FROM componenti`),
  ]);
  const p = abbinaProdotti(f.prodotti ?? [], prodotti, clienti, aliasClienti, aliasProdotti);
  const c = abbinaComponenti(f.componenti ?? [], componenti);
  const giaConPrezzo = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM prodotti WHERE prezzo_vendita IS NOT NULL`))[0].n;
  const esito = {
    anteprima: opz.anteprima,
    prodotti: {
      inPortale: prodotti.length, conPrezzo: p.abbinati.length, giaConPrezzo, manuali: p.manuali,
      daFattura: p.abbinati.filter(a => a.voce.fonte === 'fic_fattura').length,
      daAnagrafica: p.abbinati.filter(a => a.voce.fonte === 'fic_anagrafica').length,
      senzaPrezzo: prodotti.length - p.abbinati.length - p.manuali,
      vociNonTrovate: p.nonTrovati.length,
    },
    componenti: { inArchivio: componenti.length, conPrezzo: c.abbinati.length, manuali: c.manuali, vociAbbinate: c.vociAbbinate, vociNonTrovate: c.vociNonTrovate },
  };
  if (opz.anteprima) return esito;
  await transazione(async t => {
    // a pezzi da 500 righe: una query per pezzo, non una per riga
    for (let i = 0; i < p.abbinati.length; i += 500) {
      const pezzo = p.abbinati.slice(i, i + 500);
      await t.query(`UPDATE prodotti p SET prezzo_vendita = x.prezzo, prezzo_fonte = x.fonte, prezzo_data = x.data, prezzo_nota = x.nota
        FROM unnest($1::int[], $2::numeric[], $3::text[], $4::date[], $5::text[]) AS x(id, prezzo, fonte, data, nota)
        WHERE p.id = x.id AND p.prezzo_fonte IS DISTINCT FROM 'manuale'`,
        [pezzo.map(a => a.prodotto_id), pezzo.map(a => a.voce.prezzo), pezzo.map(a => a.voce.fonte), pezzo.map(a => a.voce.data), pezzo.map(a => a.voce.nota)]);
    }
    for (let i = 0; i < c.abbinati.length; i += 500) {
      const pezzo = c.abbinati.slice(i, i + 500);
      await t.query(`UPDATE componenti k SET prezzo_acquisto = x.prezzo, prezzo_fornitore = x.fornitore, prezzo_quantita = x.quantita,
          prezzo_fonte = 'fic_ordine', prezzo_data = x.data, prezzo_nota = x.nota
        FROM unnest($1::int[], $2::numeric[], $3::text[], $4::numeric[], $5::date[], $6::text[]) AS x(id, prezzo, fornitore, quantita, data, nota)
        WHERE k.id = x.id AND k.prezzo_fonte IS DISTINCT FROM 'manuale'`,
        [pezzo.map(a => a.componente_id), pezzo.map(a => a.voce.prezzo), pezzo.map(a => a.voce.fornitore), pezzo.map(a => a.voce.quantita),
          pezzo.map(a => a.voce.data), pezzo.map(a => `Ordine a fornitore ${a.voce.ordine}${a.voce.valuta !== 'EUR' ? ` (in ${a.voce.valuta}, portato in euro)` : ''}`)]);
    }
  });
  return esito;
}

// ── Listino a scaglioni (Adriano 31/10/2026): il prezzo giusto per la quantità ──

/** Scaglioni di più prodotti, per id. */
export async function scaglioniDi(ids: number[]): Promise<Map<number, Scaglione[]>> {
  const m = new Map<number, Scaglione[]>();
  if (!ids.length) return m;
  for (const r of await q<{ prodotto_id: number; da: number; a: number | null; prezzo: number }>(
    `SELECT prodotto_id, da, a, prezzo::float AS prezzo FROM prodotti_scaglioni WHERE prodotto_id = ANY($1) ORDER BY prodotto_id, da`, [ids]))
    m.set(r.prodotto_id, [...(m.get(r.prodotto_id) ?? []), { da: r.da, a: r.a, prezzo: r.prezzo }]);
  return m;
}

/** Salva gli scaglioni di un prodotto (sostituisce quelli che c'erano; lista vuota = solo prezzo unico). */
export async function salvaScaglioni(prodottoId: number, scaglioni: Scaglione[]) {
  await transazione(async t => {
    await t.query(`DELETE FROM prodotti_scaglioni WHERE prodotto_id = $1`, [prodottoId]);
    if (scaglioni.length) await t.query(`INSERT INTO prodotti_scaglioni (prodotto_id, da, a, prezzo)
      SELECT $1, x.da, x.a, x.prezzo FROM unnest($2::int[], $3::int[], $4::numeric[]) AS x(da, a, prezzo)`,
      [prodottoId, scaglioni.map(s => s.da), scaglioni.map(s => s.a), scaglioni.map(s => s.prezzo)]);
  });
}

export interface PrezzoListino { prodotto_id: number; codice: string; descrizione: string | null; prezzo: number | null; scaglione: Scaglione | null }

/** Prezzo di listino per il cliente: prodotto per id o per codice (solo tra i codici del cliente, regola codice-cliente). */
export async function prezzoListino(clienteId: number | null, rif: { prodottoId?: number | null; codice?: string | null }, quantita: number): Promise<PrezzoListino | null> {
  if (!clienteId) return null;
  const p = await q<{ id: number; codice: string; descrizione: string | null; prezzo: number | null }>(
    `SELECT id, codice, descrizione, prezzo_vendita::float AS prezzo FROM prodotti WHERE cliente_id = $1
       AND (id = $2 OR ($2::int IS NULL AND regexp_replace(upper(codice), '[^A-Z0-9]', '', 'g') = $3))
     UNION ALL SELECT p.id, p.codice, p.descrizione, p.prezzo_vendita::float FROM alias_prodotti a JOIN prodotti p ON p.id = a.prodotto_id
       WHERE $2::int IS NULL AND a.cliente_id = $1 AND a.codice = $3
     LIMIT 1`, [clienteId, rif.prodottoId || null, chiave(rif.codice)]);
  if (!p[0]) return null;
  const sc = (await scaglioniDi([p[0].id])).get(p[0].id) ?? [];
  const r = prezzoPerQuantita(p[0].prezzo, sc, quantita);
  return { prodotto_id: p[0].id, codice: p[0].codice, descrizione: p[0].descrizione, ...r };
}

/**
 * Righe del modulo di fattura / nota di credito / DDT: dove c'è il codice ma non il prezzo, il prezzo arriva dal listino del
 * cliente per quella quantità (e la descrizione, se manca). Un prezzo scritto a mano resta quello.
 */
export async function completaDaListino(clienteId: number | null, righe: any): Promise<any> {
  const elenco = Array.isArray(righe) ? righe : Object.values(righe ?? {});
  if (!clienteId) return elenco;
  for (const r of elenco as any[]) {
    if (!r || ['on', '1', true].includes(r.solo_descrizione)) continue;
    if (String(r.prezzo ?? '').trim() || !(String(r.codice ?? '').trim() || Number(r.prodotto_id))) continue;
    const quantita = Number(String(r.quantita ?? '').replace(',', '.')) || 1;
    const l = await prezzoListino(clienteId, { prodottoId: Number(r.prodotto_id) || null, codice: r.codice }, quantita);
    if (!l || l.prezzo == null) continue;
    r.prezzo = String(l.prezzo);
    r.prodotto_id = String(l.prodotto_id);
    if (!String(r.descrizione ?? '').trim()) r.descrizione = l.descrizione ?? '';
  }
  return elenco;
}
