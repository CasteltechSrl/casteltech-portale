/**
 * Righe delle fatture dei fornitori nel database (regole in engine/righe-fattura.ts): caricamento del file righe_fornitori.json.gz
 * preparato dall'archivio XML di Fatture in Cloud, lettura degli XML già salvati nel portale (fatture dallo SdI), abbinamento delle righe
 * all'archivio componenti e ai materiali di consumo, ricerca "dove l'ho comprato e a quanto". Niente controlli periodici (Neon).
 */
import { q, q1, transazione } from './db.js';
import { righeFattureDaXml, codiciFornitoreMateriale, chiavePn, paroleDescrizione, pnDallaRiga, candidatiRiga, type RigaFatturaXml, type RigaAcquistoStorica } from '../engine/righe-fattura.js';
import { NOME_FORNITORE_SQL, type RigaAcquistoLetta } from './analisi-acquisti-servizio.js';
import { leggiXml, trova, tutti } from '../engine/fattura-ricevuta.js';

type Cliente = { query: (sql: string, valori?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

/** Scrive le righe di uno o più documenti (sostituendo quelle già presenti) con poche istruzioni (Neon è remoto: mai un INSERT per riga). */
export async function salvaRigheDocumenti(c: Cliente, blocchi: { documentoId: number; righe: RigaFatturaXml[] }[]): Promise<void> {
  if (!blocchi.length) return;
  const ids = blocchi.map(b => b.documentoId);
  await c.query(`DELETE FROM documenti_ricevuti_righe WHERE documento_id = ANY($1)`, [ids]);
  const tutte = blocchi.flatMap(b => b.righe.map(r => ({ ...r, documentoId: b.documentoId })));
  for (let i = 0; i < tutte.length; i += 500) {
    const parte = tutte.slice(i, i + 500);
    const col = <T>(f: (r: typeof parte[number]) => T) => parte.map(f);
    await c.query(`INSERT INTO documenti_ricevuti_righe (documento_id, posizione, codice, codice_tipo, descrizione, quantita, um, prezzo_unitario, sconto, imponibile, aliquota, natura, pn)
      SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[], $12::text[], $13::text[])`,
      [col(r => r.documentoId), col(r => r.posizione), col(r => r.codice), col(r => r.codiceTipo), col(r => r.descrizione), col(r => r.quantita), col(r => r.um),
       col(r => r.prezzoUnitario), col(r => r.sconto), col(r => r.imponibile), col(r => r.aliquota), col(r => r.natura), col(r => r.pn)]);
  }
  await c.query(`UPDATE documenti_ricevuti SET righe_lette_il = now() WHERE id = ANY($1)`, [ids]);
}

export const salvaRigheDocumento = (c: Cliente, documentoId: number, righe: RigaFatturaXml[]) => salvaRigheDocumenti(c, [{ documentoId, righe }]);

/** Righe dall'XML di una fattura appena registrata dallo SdI (il corpo i-esimo del file). */
export async function salvaRigheDaXml(c: Cliente, documentoId: number, xml: string, corpo = 0): Promise<number> {
  const righe = righeFattureDaXml(xml)[corpo] ?? [];
  await salvaRigheDocumento(c, documentoId, righe);
  await abbinaRighe(c, documentoId);
  return righe.length;
}

/**
 * Abbina le righe (di un documento o tutte quelle non ancora abbinate) all'archivio componenti e ai materiali di consumo.
 * Componenti: ogni parola della descrizione, il P/N riconosciuto e il CodiceArticolo confrontati con P/N (anche senza trattini), codice gestionale
 * e codice di produzione dell'archivio (in memoria: poche letture, Neon è remoto). Materiali: codice MC-… oppure un codice del fornitore
 * scritto tra parentesi nella descrizione del materiale.
 */
export async function abbinaRighe(c: Cliente, documentoId?: number): Promise<{ componenti: number; materiali: number }> {
  const solo = documentoId ? `AND r.documento_id = ${Number(documentoId)}` : '';
  const perChiave = new Map<string, number>();
  for (const x of (await c.query(`SELECT id, pn_key, upper(codice_gestionale) AS g, upper(codice_produzione) AS p FROM componenti ORDER BY id DESC`)).rows) {
    if (x.pn_key) perChiave.set(`k${x.pn_key}`, x.id);
    if (x.g) perChiave.set(`g${x.g}`, x.id);
    if (x.p) perChiave.set(`p${x.p}`, x.id);
  }
  let nComp = 0;
  if (perChiave.size) {
    const righe = (await c.query(`SELECT r.id, r.pn, r.codice, r.descrizione FROM documenti_ricevuti_righe r WHERE r.componente_id IS NULL ${solo}`)).rows as { id: number; pn: string | null; codice: string | null; descrizione: string }[];
    const abbinate: { id: number; componenteId: number }[] = [];
    for (const r of righe) {
      const parole = [r.pn, r.codice, ...paroleDescrizione(r.descrizione)].filter((x): x is string => !!x);
      let trovato: number | undefined;
      for (const p of parole) {
        const su = p.toUpperCase();
        trovato = perChiave.get(`g${su}`) ?? perChiave.get(`p${su}`) ?? perChiave.get(`k${chiavePn(p)}`);
        if (trovato) break;
      }
      if (trovato) abbinate.push({ id: r.id, componenteId: trovato });
    }
    for (let i = 0; i < abbinate.length; i += 500) {
      const parte = abbinate.slice(i, i + 500);
      await c.query(`UPDATE documenti_ricevuti_righe r SET componente_id = x.cid FROM unnest($1::int[], $2::int[]) AS x(rid, cid) WHERE r.id = x.rid`, [parte.map(a => a.id), parte.map(a => a.componenteId)]);
    }
    nComp = abbinate.length;
  }
  const materiali = (await c.query(`SELECT id, codice, descrizione FROM materiali_consumo`)).rows as { id: number; codice: string; descrizione: string | null }[];
  let nMat = 0;
  for (const m of materiali) {
    const codici = [m.codice.toUpperCase(), ...codiciFornitoreMateriale(m.descrizione)];
    const esito = await c.query(`UPDATE documenti_ricevuti_righe r SET materiale_id = $1
      WHERE r.materiale_id IS NULL AND r.componente_id IS NULL ${solo}
        AND (upper(coalesce(r.codice, '')) = ANY($2) OR EXISTS (SELECT 1 FROM unnest($2::text[]) k WHERE length(k) >= 6 AND upper(r.descrizione) LIKE '%' || k || '%'))`, [m.id, codici]);
    nMat += esito.rowCount ?? 0;
  }
  return { componenti: nComp, materiali: nMat };
}

export interface DocumentoRigheFile { fic_id?: number | null; numero?: string; data?: string; piva?: string; scrittaInFic?: boolean; righe: RigaFatturaXml[] }
export interface EsitoRighe { anteprima: boolean; documenti: number; righe: number; caricati: number; giaLetti: number; nonTrovati: string[]; abbinati: { componenti: number; materiali: number }; senzaRighe: number }

/** Carica il file righe_fornitori.json.gz: ogni documento si trova per id di Fatture in Cloud (o numero + data + P.IVA), le righe sostituiscono le precedenti. */
export async function caricaRigheFornitori(dati: { documenti?: DocumentoRigheFile[] }, opz: { anteprima?: boolean } = {}): Promise<EsitoRighe> {
  const documenti = Array.isArray(dati.documenti) ? dati.documenti : [];
  return transazione(async c => {
    const esito: EsitoRighe = { anteprima: !!opz.anteprima, documenti: documenti.length, righe: 0, caricati: 0, giaLetti: 0, nonTrovati: [], abbinati: { componenti: 0, materiali: 0 }, senzaRighe: 0 };
    const trovati: { documentoId: number; righe: RigaFatturaXml[] }[] = [];
    // tutti gli id di Fatture in Cloud in una lettura sola (Neon è remoto)
    const perFic = new Map<number, { id: number; righe_lette_il: Date | null }>();
    for (const r of (await c.query(`SELECT id, fic_id, righe_lette_il FROM documenti_ricevuti WHERE fic_id IS NOT NULL`)).rows) perFic.set(Number(r.fic_id), r);
    for (const d of documenti) {
      // P/N e candidati ricalcolati con le regole di oggi (il file può essere vecchio)
      const righe = (Array.isArray(d.righe) ? d.righe : []).map(r => { const pn = pnDallaRiga(r, !!d.scrittaInFic); return { ...r, pn, candidati: candidatiRiga({ ...r, pn }) }; });
      esito.righe += righe.length;
      let doc = d.fic_id ? perFic.get(Number(d.fic_id)) ?? null : null;
      if (!doc && d.numero && d.data) doc = (await c.query(`SELECT id, righe_lette_il FROM documenti_ricevuti WHERE upper(numero) = upper($1) AND data = $2
          AND ($3 = '' OR regexp_replace(coalesce(intestatario->>'partita_iva', ''), '[^0-9A-Za-z]', '', 'g') ILIKE '%' || $3)`,
        [d.numero, d.data, (d.piva ?? '').replace(/^IT/i, '').replace(/[^0-9A-Za-z]/g, '')])).rows[0];
      if (!doc) { if (esito.nonTrovati.length < 40) esito.nonTrovati.push(`${d.numero ?? '?'} del ${(d.data ?? '').split('-').reverse().join('/')}${d.fic_id ? ` (FIC ${d.fic_id})` : ''}`); continue; }
      if (!righe.length) { esito.senzaRighe++; continue; }
      if (doc.righe_lette_il) esito.giaLetti++;
      esito.caricati++;
      if (!opz.anteprima) trovati.push({ documentoId: doc.id, righe });
    }
    for (let i = 0; i < trovati.length; i += 200) await salvaRigheDocumenti(c, trovati.slice(i, i + 200));
    if (!opz.anteprima && trovati.length) esito.abbinati = await abbinaRighe(c);
    return esito;
  });
}

/** Rilegge le righe dagli XML già nel portale (fatture dallo SdI o salvate dopo) per i documenti che non le hanno ancora. */
export async function rileggiRigheDagliXml(): Promise<{ letti: number; righe: number; abbinati: { componenti: number; materiali: number } }> {
  const docs = await q<{ id: number; xml: string; numero: string }>(`SELECT id, xml, numero FROM documenti_ricevuti WHERE xml IS NOT NULL AND righe_lette_il IS NULL ORDER BY id LIMIT 500`);
  let righe = 0;
  for (const d of docs) {
    try {
      // file con più fatture (lotto): il corpo con lo stesso numero, altrimenti il primo
      const numeri = tutti(leggiXml(d.xml), 'FatturaElettronicaBody').map(b => (trova(b, 'DatiGeneraliDocumento/Numero')?.testo ?? '').trim());
      const corpo = Math.max(0, numeri.findIndex(n => n.toUpperCase() === (d.numero ?? '').trim().toUpperCase()));
      righe += await transazione(c => salvaRigheDaXml(c, d.id, d.xml, corpo));
    } catch { /* XML non leggibile: resta senza righe */ }
  }
  const abbinati = docs.length ? await transazione(c => abbinaRighe(c)) : { componenti: 0, materiali: 0 };
  return { letti: docs.length, righe, abbinati };
}

/** Quante fatture hanno le righe e quante no (per la pagina Impostazioni). */
export const statoRighe = () => q1<{ conRighe: number; senzaRighe: number; conXml: number; righe: number }>(`SELECT
    count(*) FILTER (WHERE righe_lette_il IS NOT NULL)::int AS "conRighe", count(*) FILTER (WHERE righe_lette_il IS NULL)::int AS "senzaRighe",
    count(*) FILTER (WHERE righe_lette_il IS NULL AND xml IS NOT NULL)::int AS "conXml", (SELECT count(*) FROM documenti_ricevuti_righe)::int AS righe
  FROM documenti_ricevuti`);

const SQL_RIGHE_STORICHE = `SELECT d.id AS "documentoId", d.tipo, d.numero, to_char(d.data, 'YYYY-MM-DD') AS data, ${NOME_FORNITORE_SQL} AS fornitore,
    CASE WHEN d.fornitore_id IS NOT NULL THEN 'f' || d.fornitore_id ELSE 'n:' || upper(${NOME_FORNITORE_SQL}) END AS "fornitoreChiave",
    r.codice, r.descrizione, r.pn, r.quantita::float AS quantita, r.um, r.imponibile::float AS imponibile, r.componente_id AS "componenteId", r.materiale_id AS "materialeId"
  FROM documenti_ricevuti_righe r JOIN documenti_ricevuti d ON d.id = r.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id`;

/** Ricerca negli acquisti: P/N, codice o parole della descrizione (tutte le parole devono esserci; P/N anche senza trattini). */
export function cercaAcquisti(testo: string, max = 3000): Promise<RigaAcquistoStorica[]> {
  const parole = testo.trim().toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!parole.length) return Promise.resolve([]);
  const condizioni = parole.map((_, i) => `(upper(r.descrizione) LIKE '%' || $${i + 1} || '%' OR upper(coalesce(r.codice, '')) LIKE '%' || $${i + 1} || '%'
      OR regexp_replace(upper(coalesce(r.pn, '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace($${i + 1}, '[^A-Z0-9]', '', 'g') || '%')`);
  return q<RigaAcquistoStorica>(`${SQL_RIGHE_STORICHE} WHERE ${condizioni.join(' AND ')} ORDER BY d.data DESC, d.id DESC, r.posizione LIMIT ${max}`, parole);
}

/** Tutte le righe di fattura di un componente (abbinate, o con lo stesso P/N / codice). */
export function righeFattureComponente(c: { id: number; pn: string | null; codice_gestionale: string | null; codice_produzione: string | null }): Promise<RigaAcquistoStorica[]> {
  const codici = [c.pn, c.codice_gestionale, c.codice_produzione].filter((x): x is string => !!x && x.trim() !== '').map(x => x.trim().toUpperCase());
  const chiave = chiavePn(c.pn);
  return q<RigaAcquistoStorica>(`${SQL_RIGHE_STORICHE} WHERE r.componente_id = $1 OR upper(coalesce(r.codice, '')) = ANY($2) OR upper(coalesce(r.pn, '')) = ANY($2)
      OR ($3 <> '' AND regexp_replace(upper(coalesce(r.pn, '')), '[^A-Z0-9]', '', 'g') = $3) ORDER BY d.data, d.id, r.posizione`, [c.id, codici, chiave]);
}

/** Tutte le righe di fattura di un materiale di consumo (abbinate). */
export const righeFattureMateriale = (id: number) => q<RigaAcquistoStorica>(`${SQL_RIGHE_STORICHE} WHERE r.materiale_id = $1 ORDER BY d.data, d.id, r.posizione`, [id]);

/** Gli articoli più comprati da un fornitore (per la scheda del fornitore), dalle righe delle sue fatture. */
export const righeFattureFornitore = (chiave: string, max = 4000) => q<RigaAcquistoStorica>(`${SQL_RIGHE_STORICHE}
    WHERE CASE WHEN d.fornitore_id IS NOT NULL THEN 'f' || d.fornitore_id ELSE 'n:' || upper(${NOME_FORNITORE_SQL}) END = $1 ORDER BY d.data DESC, d.id DESC, r.posizione LIMIT ${max}`, [chiave]);

/** Le righe di fattura nella forma delle righe d'acquisto della scheda articolo (note di credito con quantità in negativo). */
export function comeRigheAcquisto(righe: RigaAcquistoStorica[]): RigaAcquistoLetta[] {
  return righe.filter(r => r.quantita && r.quantita > 0).map(r => ({
    data: r.data, documentoId: r.documentoId, numero: r.numero, fornitore: r.fornitore, fornitoreId: r.fornitoreChiave.startsWith('f') ? Number(r.fornitoreChiave.slice(1)) : null,
    quantita: (r.tipo === 'nota_credito' ? -1 : 1) * r.quantita!, prezzo: Math.round((r.imponibile / r.quantita!) * 10000) / 10000, sconto: 0,
    descrizione: r.descrizione, arrivati: 0, commessaId: null, fonte: 'fattura' as const,
  }));
}
