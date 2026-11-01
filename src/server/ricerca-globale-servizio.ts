/**
 * Letture della ricerca unica in alto (regole in engine/ricerca-globale.ts). Tutte le tabelle in parallelo, poche righe
 * ciascuna (LIMIT), una sola volta per ricerca: niente aggiornamenti automatici (database Neon).
 * Il profilo Contabilità (sola lettura) cerca solo tra i documenti emessi e le fatture dei fornitori.
 */
import { q } from './db.js';
import type { Ruolo } from '../engine/ruoli.js';
import { numeroCompleto } from '../engine/amministrazione.js';
import { cercaGuida, indirizzoArgomento } from '../engine/guida.js';
import { interpretaRicerca, ordinaRisultati, NOME_DOCUMENTO, type RisultatoRicerca } from '../engine/ricerca-globale.js';

const LIMITE = 8;
/** "rs0603" trova "RS-0603-2K2": stesso confronto compatto della ricerca veloce, fatto in SQL. */
const SQL_COMPATTO = (col: string) => `regexp_replace(lower(${col}), '[^a-z0-9]', '', 'g') LIKE '%' || regexp_replace(lower($1), '[^a-z0-9]', '', 'g') || '%'`;
const dataIt = (d: unknown) => (d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10).split('-').reverse().join('/') : '');

export async function cercaOvunque(testoGrezzo: string, ruolo: Ruolo): Promise<RisultatoRicerca[]> {
  const r = interpretaRicerca(testoGrezzo);
  const t = r.testo;
  if (t.length < 2) return [];
  const soloAmministrazione = ruolo === 'contabilita';
  const compatto = t.replace(/[^a-z0-9]/gi, '');
  const letture: Promise<RisultatoRicerca[]>[] = [];

  // documenti emessi e fatture dei fornitori: li vedono ufficio e contabilità
  letture.push(q(`SELECT d.id, d.tipo, d.numero, d.sezionale, d.anno, d.data, d.stato,
      coalesce(c.ragione_sociale, fa.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS chi
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
    WHERE ${r.numero ? `d.numero = $1::int AND ($2::int IS NULL OR d.anno = $2)` : `(coalesce(d.riferimento_esterno, '') ILIKE '%' || $1 || '%' OR d.numero::text || '/' || d.anno = $1)`}
    ORDER BY d.anno DESC, d.data DESC LIMIT ${LIMITE * 2}`, r.numero ? [r.numero.numero, r.numero.anno ?? null] : [t])
    .then(righe => righe.map(d => ({
      tipo: 'documento' as const,
      titolo: `${NOME_DOCUMENTO[d.tipo] ?? d.tipo} ${d.numero == null ? 'bozza' : numeroCompleto(d.numero, d.sezionale ?? undefined)}/${d.anno}`,
      dettaglio: [d.chi, dataIt(d.data), d.stato].filter(Boolean).join(' · '),
      href: d.tipo === 'ordine_fornitore' ? `/ordini/fornitori/${d.id}` : `/amministrazione/documenti/${d.id}`,
      chiave: `${d.numero}/${d.anno}`,
    }))));
  letture.push(q(`SELECT d.id, d.tipo, d.numero, d.data, d.totale, coalesce(fa.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS chi
    FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
    WHERE ${r.numero ? `d.numero = $1 OR d.numero ILIKE $1 || '/%' OR d.numero ILIKE $1 || ' %'` : `d.numero ILIKE $1 || '%' OR (length($1) >= 4 AND coalesce(d.descrizione, '') ILIKE '%' || $1 || '%')`}
    ORDER BY d.data DESC LIMIT ${LIMITE}`, [r.numero ? String(r.numero.numero) : t])
    .then(righe => righe.map(d => ({
      tipo: 'ricevuto' as const, titolo: `${d.tipo === 'nota_credito' ? 'Nota di credito' : 'Fattura'} ${d.numero} di ${d.chi}`,
      dettaglio: [dataIt(d.data), d.totale != null ? `${Number(d.totale).toFixed(2).replace('.', ',')} €` : ''].filter(Boolean).join(' · '),
      href: `/amministrazione/ricevuti/${d.id}`, chiave: String(d.numero),
    }))));

  if (!soloAmministrazione) {
    letture.push(q(`SELECT id, ragione_sociale, partita_iva, comune FROM clienti
      WHERE ${r.partitaIva ? `partita_iva = $1` : `${SQL_COMPATTO('ragione_sociale')} OR partita_iva = $1`} ORDER BY ragione_sociale LIMIT ${LIMITE}`, [r.partitaIva ?? t])
      .then(righe => righe.map(c => ({ tipo: 'cliente' as const, titolo: c.ragione_sociale, dettaglio: [c.partita_iva ? `P.IVA ${c.partita_iva}` : '', c.comune].filter(Boolean).join(' · '),
        href: `/anagrafiche/clienti/${c.id}`, chiave: r.partitaIva ? c.partita_iva : c.ragione_sociale }))));
    letture.push(q(`SELECT p.id, p.codice, p.descrizione, p.cliente_id, c.ragione_sociale FROM prodotti p JOIN clienti c ON c.id = p.cliente_id
      WHERE ${SQL_COMPATTO('p.codice')} OR p.descrizione ILIKE '%' || $1 || '%' ORDER BY p.codice LIMIT ${LIMITE}`, [t])
      .then(righe => righe.map(p => ({ tipo: 'prodotto' as const, titolo: p.codice, dettaglio: [p.descrizione, p.ragione_sociale].filter(Boolean).join(' · '),
        href: `/anagrafiche/prodotti?cliente=${p.cliente_id}&q=${encodeURIComponent(p.codice)}`, chiave: p.codice }))));
    letture.push(q(`SELECT c.id, c.numero, c.stato, c.quantita, c.data_consegna, c.ordine_cliente, c.intestazione FROM commesse c
      WHERE ${r.commessa ? `c.numero = $2 OR ${SQL_COMPATTO('c.numero')}` : r.numero ? `c.numero LIKE '%-' || lpad($1, 4, '0') OR c.ordine_cliente = $1` : `${SQL_COMPATTO('c.numero')} OR c.ordine_cliente ILIKE '%' || $1 || '%' OR (c.intestazione->>'cliente') ILIKE '%' || $1 || '%' OR (c.intestazione->>'codice') ILIKE '%' || $1 || '%'`}
      ORDER BY c.numero DESC LIMIT ${LIMITE}`, r.commessa ? [t, r.commessa] : r.numero ? [String(r.numero.numero)] : [t])
      .then(righe => righe.map(c => ({ tipo: 'commessa' as const, titolo: `Commessa ${c.numero}`,
        dettaglio: [c.intestazione?.cliente, c.intestazione?.codice, c.quantita ? `${c.quantita} pz` : '', c.stato?.replace(/_/g, ' '), c.data_consegna ? `consegna ${dataIt(c.data_consegna)}` : ''].filter(Boolean).join(' · '),
        href: `/commesse/${c.id}`, chiave: c.numero }))));
    letture.push(q(`SELECT o.id, o.numero, o.anno, o.rif_cliente, o.data_ordine, coalesce(c.ragione_sociale, o.cliente_nome, '') AS chi
      FROM ordini o LEFT JOIN clienti c ON c.id = o.cliente_id
      WHERE ${r.numero ? `o.numero = $1::int AND ($2::int IS NULL OR o.anno = $2)` : `coalesce(o.rif_cliente, '') ILIKE '%' || $1 || '%' OR o.numero::text || '/' || o.anno = $1`}
      ORDER BY o.anno DESC, o.numero DESC LIMIT ${LIMITE}`, r.numero ? [r.numero.numero, r.numero.anno ?? null] : [t])
      .then(righe => righe.map(o => ({ tipo: 'ordine' as const, titolo: `Ordine ${o.numero}/${o.anno}`,
        dettaglio: [o.chi, o.rif_cliente ? `rif. ${o.rif_cliente}` : '', dataIt(o.data_ordine)].filter(Boolean).join(' · '), href: `/ordini/${o.id}`, chiave: `${o.numero}/${o.anno}` }))));
    letture.push(q(`SELECT id, numero, stato, intestazione, creato_il FROM preventivi
      WHERE ${r.numero ? `numero = $1 OR numero ILIKE '%' || $1` : `numero ILIKE '%' || $1 || '%' OR (intestazione->>'codice') ILIKE '%' || $1 || '%' OR (intestazione->>'cliente') ILIKE '%' || $1 || '%'`}
      ORDER BY creato_il DESC LIMIT ${LIMITE}`, [r.numero ? String(r.numero.numero) : t])
      .then(righe => righe.map(p => ({ tipo: 'preventivo' as const, titolo: `Preventivo ${p.numero ?? p.id}`,
        dettaglio: [p.intestazione?.cliente, p.intestazione?.codice, p.stato?.replace(/_/g, ' '), dataIt(p.creato_il)].filter(Boolean).join(' · '), href: `/preventivi/${p.id}`, chiave: String(p.numero ?? '') }))));
    letture.push(q(`SELECT id, ragione_sociale, partita_iva, comune FROM fornitori_anagrafica
      WHERE ${r.partitaIva ? `partita_iva LIKE '%' || $1` : `${SQL_COMPATTO('ragione_sociale')} OR partita_iva = $1`} ORDER BY ragione_sociale LIMIT ${LIMITE}`, [r.partitaIva ?? t])
      .then(righe => righe.map(f => ({ tipo: 'fornitore' as const, titolo: f.ragione_sociale, dettaglio: [f.partita_iva, f.comune].filter(Boolean).join(' · '),
        href: `/anagrafiche/fornitori/${f.id}`, chiave: f.ragione_sociale }))));
    letture.push(q(`SELECT id, ragione_sociale, citta, stato, cliente_id FROM crm_aziende
      WHERE cliente_id IS NULL AND (${SQL_COMPATTO('ragione_sociale')} OR partita_iva = $1 OR coalesce(altri_nomi, '') ILIKE '%' || $1 || '%')
      ORDER BY ragione_sociale LIMIT ${LIMITE}`, [t])
      .then(righe => righe.map(a => ({ tipo: 'crm' as const, titolo: a.ragione_sociale, dettaglio: [a.citta, a.stato].filter(Boolean).join(' · '), href: `/crm/${a.id}`, chiave: a.ragione_sociale }))));
    if (compatto.length >= 3 && !r.numero) {
      letture.push(q(`SELECT pn, codice_produzione, codice_gestionale, descrizione FROM componenti
        WHERE ${SQL_COMPATTO('pn')} OR ${SQL_COMPATTO('codice_produzione')} OR ${SQL_COMPATTO('codice_gestionale')} ORDER BY pn LIMIT ${LIMITE}`, [t])
        .then(righe => righe.map(k => ({ tipo: 'componente' as const, titolo: k.pn ?? k.codice_produzione, dettaglio: [k.codice_produzione, k.codice_gestionale, k.descrizione].filter(Boolean).join(' · '),
          href: `/anagrafiche/componenti?q=${encodeURIComponent(k.pn ?? k.codice_produzione)}`, chiave: k.pn ?? k.codice_produzione }))));
    }
  }

  const trovati = (await Promise.all(letture)).flat();
  // la guida solo se non è un numero (la gente cerca "come si fa…" a parole)
  if (!r.numero && !r.partitaIva) {
    for (const g of cercaGuida(t, 3)) trovati.push({ tipo: 'guida', titolo: g.argomento.titolo, dettaglio: g.area.nome, href: indirizzoArgomento(g.argomento), chiave: g.argomento.titolo });
  }
  return ordinaRisultati(trovati, t);
}
