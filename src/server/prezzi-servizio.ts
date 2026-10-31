/**
 * Caricamento dei prezzi da Fatture in Cloud in Anagrafiche (Adriano 31/10/2026): prezzo di vendita dei prodotti e ultimo
 * prezzo di acquisto dei componenti. Il file lo prepara Claude con tools/prezzi-da-fic.ts. Prima un riepilogo, poi la conferma;
 * si può ricaricare: i prezzi scritti a mano dall'ufficio (fonte 'manuale') non si toccano.
 */
import { q, transazione } from './db.js';
import { abbinaProdotti, abbinaComponenti, type FilePrezzi } from '../engine/prezzi-fic.js';

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
