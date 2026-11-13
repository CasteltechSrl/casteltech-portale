/**
 * Acquisti → Materiale di consumo (Adriano 13/11/2026): letture e salvataggi. Regole e conti in engine/magazzino-consumo.ts.
 * Tutto letto all'apertura della pagina (Neon): niente controlli periodici, niente tabelle di movimenti da tenere allineate.
 */
import { q, q1 } from './db.js';
import { vociConsumo } from '../engine/consumi.js';
import {
  VOCI_MAGAZZINO, consumoMensile, contenutoProposto, costoInVoce, cruscottoConsumo, indicatoriVoce, situazioneGiacenza, ultimoAcquisto, voceMagazzino, voceProposta,
  type AcquistoArticolo, type IndicatoriVoce, type MovimentoConsumo, type SituazioneGiacenza, type VoceMagazzino,
} from '../engine/magazzino-consumo.js';

export interface ImpostazioniMagazzinoConsumo { scorte: Record<string, number>; costi: Record<string, number> }

export async function impostazioniMagazzinoConsumo(): Promise<ImpostazioniMagazzinoConsumo> {
  const v = (await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'magazzino_consumo'`))?.valore ?? {};
  return { scorte: v.scorte ?? {}, costi: v.costi ?? {} };
}
async function salvaImpostazioni(v: ImpostazioniMagazzinoConsumo) {
  await q(`INSERT INTO impostazioni (chiave, valore, aggiornato_il) VALUES ('magazzino_consumo', $1, now())
    ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, aggiornato_il = now()`, [JSON.stringify(v)]);
}

export interface ArticoloVoce {
  id: number; codice: string; descrizione: string; categoria: string; um: string | null; attivo: boolean;
  voce: string | null; voceScelta: string | null; contenuto: number | null; contenutoScritto: number | null;
}

const ORDINI_OK = `d.tipo = 'ordine_fornitore' AND d.stato NOT IN ('bozza', 'annullato', 'scartato')`;
const NOME_FORNITORE = `coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale')`;

async function articoli(): Promise<ArticoloVoce[]> {
  const righe = await q<{ id: number; codice: string; descrizione: string; categoria: string; um: string | null; attivo: boolean; voce_consumo: string | null; contenuto: number | null }>(
    `SELECT id, codice, descrizione, categoria, um, attivo, voce_consumo, contenuto::float AS contenuto FROM materiali_consumo ORDER BY codice`);
  return righe.map(m => {
    const voce = m.voce_consumo === '-' ? null : m.voce_consumo && voceMagazzino(m.voce_consumo) ? m.voce_consumo : voceProposta(m);
    const v = voce ? voceMagazzino(voce)! : null;
    return { id: m.id, codice: m.codice, descrizione: m.descrizione, categoria: m.categoria, um: m.um, attivo: m.attivo,
      voce, voceScelta: m.voce_consumo, contenutoScritto: m.contenuto,
      contenuto: m.contenuto != null && m.contenuto > 0 ? m.contenuto : v ? contenutoProposto(m, v) : null };
  });
}

/** Righe degli ordini a fornitore emessi con un codice MC-… (prezzo netto dello sconto). */
const righeOrdini = () => q<{ codice: string; data: string; quando: string; quantita: number; prezzo: number; fornitore: string | null; numero: string; id: number; fatturaConRighe: boolean }>(
  `SELECT upper(trim(r.codice)) AS codice, to_char(d.data, 'YYYY-MM-DD') AS data, to_char(d.creato_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI:SS') AS quando,
     coalesce(r.quantita, 0)::float AS quantita, (coalesce(r.prezzo, 0) * (1 - coalesce(r.sconto, 0) / 100))::float AS prezzo, ${NOME_FORNITORE} AS fornitore,
     coalesce(d.numero::text, '') || CASE WHEN d.sezionale <> '' THEN '/' || d.sezionale ELSE '' END AS numero, d.id,
     EXISTS (SELECT 1 FROM documenti_ricevuti x WHERE x.id = d.ricevuto_id AND x.righe_lette_il IS NOT NULL) AS "fatturaConRighe"
   FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
   WHERE ${ORDINI_OK} AND NOT r.solo_descrizione AND upper(trim(coalesce(r.codice, ''))) LIKE 'MC-%'`);

/** Righe delle fatture dei fornitori abbinate a un materiale (note di credito in negativo). */
const righeFatture = () => q<{ materialeId: number; data: string; quantita: number | null; um: string | null; imponibile: number; nc: boolean; fornitore: string | null; numero: string; id: number }>(
  `SELECT r.materiale_id AS "materialeId", to_char(d.data, 'YYYY-MM-DD') AS data, r.quantita::float AS quantita, r.um, coalesce(r.imponibile, 0)::float AS imponibile,
     d.tipo = 'nota_credito' AS nc, ${NOME_FORNITORE} AS fornitore, d.numero, d.id
   FROM documenti_ricevuti_righe r JOIN documenti_ricevuti d ON d.id = r.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
   WHERE r.materiale_id IS NOT NULL`);

const inventari = () => q<{ id: number; voce: string; data: string; quando: string; quantita: number; nota: string | null; dettaglio: any; utente: string | null }>(
  `SELECT i.id, i.voce, to_char(i.data, 'YYYY-MM-DD') AS data, CASE WHEN i.data = (i.creato_il AT TIME ZONE 'Europe/Rome')::date
       THEN to_char(i.creato_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI:SS') ELSE to_char(i.data, 'YYYY-MM-DD') || 'T23:59:59' END AS quando,
     i.quantita::float AS quantita, i.nota, i.dettaglio, u.nome AS utente
   FROM consumo_inventari i LEFT JOIN utenti u ON u.id = i.creato_da ORDER BY i.creato_il`);

/** Commesse rientrate da quando serve (inventario più vecchio o 12 mesi fa), con i consumi scritti e il preventivo per la stima. */
async function commesseRientrate(dal: string) {
  const commesse = await q<{ id: number; codice: string; quantita: number; consumi: Record<string, number> | null; data: string; quando: string; preventivo_id: number | null }>(
    `SELECT id, numero AS codice, coalesce(quantita, 0)::float AS quantita, consumi, to_char(rientrata_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS data,
       to_char(rientrata_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI:SS') AS quando, preventivo_id
     FROM commesse WHERE rientrata_il IS NOT NULL AND rientrata_il >= $1::date ORDER BY rientrata_il`, [dal]);
  const ids = [...new Set(commesse.map(c => c.preventivo_id).filter((x): x is number => x != null))];
  const prev = new Map((ids.length ? await q<any>(`SELECT id, catalogo, parametri, n_schede FROM preventivi WHERE id = ANY($1)`, [ids]) : []).map(p => [p.id, p]));
  return commesse.map(c => ({ ...c, voci: vociConsumo(c.preventivo_id ? prev.get(c.preventivo_id) ?? null : null, c.quantita) }));
}

export interface VoceSituazione {
  voce: VoceMagazzino; articoli: ArticoloVoce[]; senzaContenuto: ArticoloVoce[];
  ultimo: (AcquistoArticolo & { articolo: ArticoloVoce }) | null; prezzo: number | null; costo: number | null; costoManuale: boolean;
  acquisti: (AcquistoArticolo & { articolo: ArticoloVoce })[];
  situazione: SituazioneGiacenza; consumi: MovimentoConsumo[]; ind: IndicatoriVoce; scorta: number | null;
  acquistato12: number; spesaAnni: Record<number, number>;
}

const giorniFa = (oggi: string, g: number) => new Date(Date.parse(oggi) - g * 86400000).toISOString().slice(0, 10);

/** Tutto quello che serve alla pagina: per ogni voce articoli, ultimo acquisto, movimenti, giacenza e indicatori; in più il cruscotto. */
export async function datiMagazzinoConsumo(oggi: string) {
  const [arts, ordini, fatture, inv, imp, anagrafica] = await Promise.all([articoli(), righeOrdini(), righeFatture(), inventari(), impostazioniMagazzinoConsumo(), acquistiAnagrafica()]);
  const primoInventario = inv.reduce((m, i) => (i.data < m ? i.data : m), giorniFa(oggi, 365));
  const commesse = await commesseRientrate(primoInventario);
  const perCodice = new Map(arts.map(a => [a.codice, a])), perId = new Map(arts.map(a => [a.id, a]));
  const anno12 = giorniFa(oggi, 365);

  const voci: VoceSituazione[] = VOCI_MAGAZZINO.map(voce => {
    const articoliVoce = arts.filter(a => a.voce === voce.codice);
    const acquisti: (AcquistoArticolo & { articolo: ArticoloVoce })[] = [];
    const movimenti: MovimentoConsumo[] = [];
    const spesaAnni: Record<number, number> = {};
    let acquistato12 = 0;
    const spesa = (data: string, euro: number) => { spesaAnni[Number(data.slice(0, 4))] = (spesaAnni[Number(data.slice(0, 4))] ?? 0) + euro; if (data >= anno12 && data <= oggi) acquistato12 += euro; };
    for (const o of ordini) {
      const a = perCodice.get(o.codice);
      if (!a || a.voce !== voce.codice) continue;
      acquisti.push({ articoloId: a.id, codice: a.codice, data: o.data, quantita: o.quantita, um: a.um, prezzo: o.prezzo, fornitore: o.fornitore, fonte: 'ordine',
        costo: costoInVoce(o.prezzo * o.quantita, o.quantita, null, a, voce),
        documento: `ordine ${o.numero}`, href: `/ordini/fornitori/${o.id}`, articolo: a });
      if (!o.fatturaConRighe) spesa(o.data, o.quantita * o.prezzo);
      if (a.contenuto) movimenti.push({ tipo: 'carico', data: o.data, quando: o.quando, quantita: o.quantita * a.contenuto,
        testo: `Ordine ${o.numero} a ${o.fornitore ?? 'fornitore'}: ${o.quantita} × ${a.codice}`, href: `/ordini/fornitori/${o.id}` });
    }
    for (const f of fatture) {
      const a = perId.get(f.materialeId);
      if (!a || a.voce !== voce.codice) continue;
      spesa(f.data, (f.nc ? -1 : 1) * f.imponibile);
      if (!f.nc && f.quantita && f.quantita > 0 && f.imponibile > 0)
        acquisti.push({ articoloId: a.id, codice: a.codice, data: f.data, quantita: f.quantita, um: f.um, prezzo: f.imponibile / f.quantita, fornitore: f.fornitore, fonte: 'fattura',
          costo: costoInVoce(f.imponibile, f.quantita, f.um, a, voce),
          documento: `fattura ${f.numero}`, href: `/amministrazione/ricevuti/${f.id}`, articolo: a });
    }
    for (const i of inv.filter(x => x.voce === voce.codice))
      movimenti.push({ tipo: 'inventario', data: i.data, quando: i.quando, quantita: i.quantita, inventarioId: i.id,
        testo: `Inventario${i.utente ? ` di ${i.utente}` : ''}${i.nota ? ` (${i.nota})` : ''}` });
    const consumi: MovimentoConsumo[] = [];
    for (const c of commesse) {
      const vc = c.voci.find(v => v.codice === voce.codice);
      const scritto = c.consumi?.[voce.codice];
      let quantita: number | null = null, stimato = false;
      if (scritto != null && Number.isFinite(Number(scritto))) quantita = Number(scritto);
      else if (vc?.previsto != null && voce.codice !== 'viteria') { quantita = vc.perLotto ? vc.previsto : vc.previsto * c.quantita; stimato = true; }
      if (!quantita || quantita <= 0) continue;
      const m: MovimentoConsumo = { tipo: 'consumo', data: c.data, quando: c.quando, quantita: quantita * voce.dallaScheda, stimato,
        testo: `Commessa ${c.codice} (${c.quantita} schede)${stimato ? ' — stimato dal preventivo' : ''}`, href: `/commesse/${c.id}` };
      consumi.push(m); movimenti.push(m);
    }
    // anagrafica: ultimo acquisto scritto (anche dal file di FIC); vale solo se più recente degli ordini e delle fatture
    for (const a of articoliVoce) { const x = anagrafica.get(a.id); if (x) acquisti.push({ ...x, costo: costoInVoce(x.prezzo, 1, null, a, voce), articolo: a }); }
    const ultimo = ultimoAcquisto(acquisti);
    const situazione = situazioneGiacenza(movimenti, oggi);
    const prezzo = ultimo?.prezzo ?? null;
    const costoAcquisto = ultimo?.costo ?? null;
    const costoManuale = costoAcquisto == null && imp.costi[voce.codice] > 0;
    const costo = costoAcquisto ?? (costoManuale ? imp.costi[voce.codice] : null);
    const scorta = imp.scorte[voce.codice] > 0 ? imp.scorte[voce.codice] : null;
    const ind = indicatoriVoce(situazione, costo, consumoMensile(consumi, oggi), scorta);
    return { voce, articoli: articoliVoce, senzaContenuto: articoliVoce.filter(a => !a.contenuto), ultimo, prezzo, costo, costoManuale,
      acquisti: acquisti.sort((a, b) => b.data.localeCompare(a.data)), situazione, consumi, ind, scorta, acquistato12, spesaAnni };
  });
  return { voci, senzaVoce: arts.filter(a => !a.voce && a.attivo), cruscotto: cruscottoConsumo(voci.map(v => ({ ind: v.ind, costo: v.costo, acquistato12: v.acquistato12, stimato: v.situazione.consumatoStimato > 0 }))), impostazioni: imp };
}

/** Ultimo acquisto scritto nell'anagrafica dei materiali (prezzo_acquisto, anche dal file di FIC) come acquisti di fonte 'anagrafica'. */
export async function acquistiAnagrafica(): Promise<Map<number, Omit<AcquistoArticolo, 'costo'>>> {
  const r = await q<{ id: number; codice: string; prezzo: number; data: string; fornitore: string | null; quantita: number | null }>(
    `SELECT id, codice, prezzo_acquisto::float AS prezzo, to_char(prezzo_data, 'YYYY-MM-DD') AS data, prezzo_fornitore AS fornitore, prezzo_quantita::float AS quantita
     FROM materiali_consumo WHERE prezzo_acquisto > 0 AND prezzo_data IS NOT NULL`);
  return new Map(r.map(x => [x.id, { articoloId: x.id, codice: x.codice, data: x.data, quantita: x.quantita, um: null, prezzo: x.prezzo, fornitore: x.fornitore,
    fonte: 'anagrafica' as const, documento: 'ultimo acquisto in anagrafica', href: `/anagrafiche/materiali?q=${encodeURIComponent(x.codice)}` }]));
}

/** Inventario di una voce (quantità nella unità della voce). Se vengono i pezzi contati per articolo, la quantità è la loro somma. */
export async function salvaInventario(voce: string, quantita: number, dataInv: string, utenteId: number | null, nota: string | null, dettaglio: Record<string, number> | null) {
  if (!voceMagazzino(voce)) throw new Error('voce sconosciuta');
  await q(`INSERT INTO consumo_inventari (voce, data, quantita, dettaglio, nota, creato_da) VALUES ($1, $2, $3, $4, $5, $6)`,
    [voce, dataInv, quantita, dettaglio ? JSON.stringify(dettaglio) : null, nota, utenteId]);
}

export async function eliminaInventario(id: number): Promise<string | null> {
  const r = await q1<{ voce: string }>(`DELETE FROM consumo_inventari WHERE id = $1 RETURNING voce`, [id]);
  return r?.voce ?? null;
}

/** Articoli della voce: voce ('' = proposta, '-' = nessuna) e contenuto (vuoto = proposto). */
export async function salvaArticoliVoce(cambi: { id: number; voce: string; contenuto: number | null }[]) {
  for (const c of cambi) {
    const voce = c.voce === '' ? null : c.voce === '-' || voceMagazzino(c.voce) ? c.voce : null;
    await q(`UPDATE materiali_consumo SET voce_consumo = $2, contenuto = $3, aggiornato_il = now() WHERE id = $1`, [c.id, voce, c.contenuto && c.contenuto > 0 ? c.contenuto : null]);
  }
}

export async function salvaScortaECosto(voce: string, scorta: number | null, costo: number | null) {
  const imp = await impostazioniMagazzinoConsumo();
  if (scorta && scorta > 0) imp.scorte[voce] = scorta; else delete imp.scorte[voce];
  if (costo && costo > 0) imp.costi[voce] = costo; else delete imp.costi[voce];
  await salvaImpostazioni(imp);
}

export { articoli as articoliMagazzinoConsumo };
