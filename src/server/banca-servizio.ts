/**
 * Banca (Adriano 7/11/2026): caricamento dell'estratto conto, abbinamento con le rate, distinte RiBa. Regole in `engine/banca.ts`.
 */
import { q, q1, transazione } from './db.js';
import { leggiFileBom } from './codifica-servizio.js';
import { testoDaFile } from '../engine/componenti-clienti.js';
import { anticipiDelleFatture, type AnticipoFattura, type FatturaPerAnticipi, type RataIncasso } from '../engine/anticipi.js';
import { rataMancante, abiCabDaIban, chiaviMovimenti, contoNuovo, nomeConto, numeroConto, saldoConto, type ContoBanca, controlliCreditore, controlliEffetto, generaRiba, leggiCbi, movimentiDaTabella, proponiAbbinamento,
  categoriaProposta, type CreditoreRiba, type EffettoRiba, type Movimento, type Proposta, type RataAperta } from '../engine/banca.js';

const STATI_OK = `d.stato NOT IN ('bozza', 'annullato', 'scartato') AND d.numero IS NOT NULL`;

/** Movimenti letti dal file: CBI (testo a righe fisse) oppure Excel/CSV dell'home banking. */
export async function leggiEstrattoConto(nome: string, dati: Buffer): Promise<{ movimenti: Movimento[]; formato: string; errore?: string }> {
  const n = nome.toLowerCase();
  if (n.endsWith('.xls')) return { movimenti: [], formato: 'xls', errore: 'File .xls (Excel 97-2003): aprilo in Excel e salvalo come .xlsx o .csv, oppure scarica dall\'home banking il formato CBI.' };
  if (!n.endsWith('.xlsx')) {
    const testo = testoDaFile(dati);
    const cbi = leggiCbi(testo);
    if (cbi) return { movimenti: cbi, formato: 'CBI' };
    try {
      const righe = await leggiFileBom(n.endsWith('.csv') ? n : `${n}.csv`, Buffer.from(testo, 'utf8'));
      return { ...movimentiDaTabella(righe, true), formato: 'CSV' };
    } catch (e) { return { movimenti: [], formato: 'CSV', errore: (e as Error).message }; }
  }
  try { return { ...movimentiDaTabella(await leggiFileBom(n, dati), false), formato: 'Excel' }; }
  catch (e) { return { movimenti: [], formato: 'Excel', errore: `File Excel non leggibile: ${(e as Error).message}` }; }
}

async function impostazioniBanca(): Promise<{ sia?: string; conti?: ContoBanca[] }> {
  return (await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'banca'`))?.valore ?? {};
}
async function salvaImpostazioniBanca(parte: Record<string, unknown>): Promise<void> {
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('banca', $1::jsonb)
    ON CONFLICT (chiave) DO UPDATE SET valore = impostazioni.valore || $1::jsonb, aggiornato_il = now()`, [JSON.stringify(parte)]);
}
const ibanAzienda = async () => String((await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore?.iban ?? '');

/** Conti della banca (nome, tipo, saldo di riferimento, fido). */
export async function contiBanca(): Promise<ContoBanca[]> {
  return (await impostazioniBanca()).conti ?? [];
}
export async function salvaConti(conti: ContoBanca[], fidoAnticipi?: number | null): Promise<void> {
  await salvaImpostazioniBanca(fidoAnticipi === undefined ? { conti } : { conti, fidoAnticipi });
}
/** Affidamento per gli anticipi fatture (uno per tutti i conti d'anticipo). */
export async function fidoAnticipi(): Promise<number | null> {
  const v = (await impostazioniBanca() as any).fidoAnticipi;
  return typeof v === 'number' ? v : null;
}

/** Conti con il saldo di oggi (riferimento + movimenti caricati dopo) e l'ultimo movimento caricato. */
export async function contiConSaldo() {
  const [conti, mov] = await Promise.all([contiBanca(),
    q<{ conto: string; data: string; importo: number }>(`SELECT conto, to_char(data, 'YYYY-MM-DD') AS data, importo::float AS importo FROM banca_movimenti`)]);
  return conti.map(c => {
    const suoi = mov.filter(m => m.conto === c.numero);
    const saldo = saldoConto(c, suoi);
    return { ...c, movimenti: suoi.length, ultimo: suoi.reduce((u, m) => (m.data > u ? m.data : u), ''), saldoOggi: saldo,
      disponibile: saldo != null && c.fido != null ? Math.round((saldo + c.fido) * 100) / 100 : null };
  });
}

/**
 * Scrive i movimenti nuovi (quelli già caricati hanno la stessa chiave e si saltano). Conto del movimento = numero del conto dal file
 * (CSV di BPER con più conti) oppure quello scelto nella pagina; "BPER" o vuoto = il conto dell'IBAN dell'azienda. I conti nuovi entrano nell'elenco dei conti.
 */
export async function caricaMovimenti(movimenti: Movimento[], conto: string, file: string): Promise<{ nuovi: number; gia: number }> {
  const iban = await ibanAzienda();
  const scelto = !conto || conto.toUpperCase() === 'BPER' ? numeroConto(iban) || 'BPER' : numeroConto(conto);
  const conMov = movimenti.map(m => ({ ...m, rapporto: m.rapporto ?? scelto }));
  const chiavi = chiaviMovimenti(conMov, scelto);
  const inseriti = await q<{ id: number }>(`INSERT INTO banca_movimenti (conto, data, valuta, importo, descrizione, causale, chiave, file)
    SELECT m.rapporto, m.data, m.valuta, m.importo, m.descrizione, m.causale, m.chiave, $1
    FROM jsonb_to_recordset($2::jsonb) AS m(rapporto text, data date, valuta date, importo numeric, descrizione text, causale text, chiave text)
    ON CONFLICT (chiave) DO NOTHING RETURNING id`, [file, JSON.stringify(conMov.map((m, i) => ({ ...m, chiave: chiavi[i] })))]);
  const conti = await contiBanca();
  const nuovi = [...new Set(conMov.map(m => m.rapporto!))].filter(n => !conti.some(c => c.numero === n));
  if (nuovi.length) await salvaConti([...conti, ...nuovi.map(n => contoNuovo(n, iban))]);
  return { nuovi: inseriti.length, gia: movimenti.length - inseriti.length };
}

/** Rate ancora aperte: delle fatture emesse (da incassare) e delle fatture dei fornitori (da pagare). */
export async function rateAperte(): Promise<RataAperta[]> {
  const [emesse, ricevute] = await Promise.all([
    q<any>(`SELECT s.id, d.id AS documento_id, d.numero::text AS numero, coalesce(d.sezionale, '') AS sezionale, to_char(d.data, 'YYYY-MM-DD') AS data_doc,
        to_char(s.data, 'YYYY-MM-DD') AS scadenza, s.importo::float AS importo, s.modalita, s.riba_distinta_id,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS controparte, c.partita_iva
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' AND ${STATI_OK}`),
    q<any>(`SELECT s.id, d.id AS documento_id, coalesce(d.numero, '')::text AS numero, to_char(d.data, 'YYYY-MM-DD') AS data_doc,
        to_char(s.data, 'YYYY-MM-DD') AS scadenza, s.importo::float AS importo,
        coalesce(f.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS controparte, f.partita_iva
      FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura'`),
  ]);
  return [
    ...emesse.map((r): RataAperta => ({ id: r.id, tipo: 'emessa', documentoId: r.documento_id, numero: r.sezionale ? `${r.numero}/${r.sezionale}` : r.numero,
      dataDoc: r.data_doc, scadenza: r.scadenza, importo: r.importo, controparte: r.controparte, partitaIva: r.partita_iva,
      riba: r.modalita === 'MP12', distintaId: r.riba_distinta_id })),
    ...ricevute.map((r): RataAperta => ({ id: r.id, tipo: 'ricevuta', documentoId: r.documento_id, numero: r.numero, dataDoc: r.data_doc,
      scadenza: r.scadenza, importo: r.importo, controparte: r.controparte, partitaIva: r.partita_iva })),
  ];
}

/**
 * Rate già segnate incassate/pagate (di solito dallo storico di Fatture in Cloud) che nessun movimento ha ancora confermato:
 * il movimento della banca le "spunta" senza cambiarle (Adriano 7/11/2026: gennaio–ottobre senza abbinare tutto a mano).
 */
export async function ratePagateLibere(tipo?: 'emessa' | 'ricevuta', dal = '2000-01-01'): Promise<(RataAperta & { pagataIl: string; modo: string | null; conto: string | null })[]> {
  const prese = await q<{ tipo: string; id: number }>(`SELECT x->>'tipo' AS tipo, (x->>'id')::int AS id FROM banca_movimenti, jsonb_array_elements(rate) x WHERE stato = 'abbinato'`);
  const occupate = new Set(prese.map(p => `${p.tipo}:${p.id}`));
  const [emesse, ricevute] = await Promise.all([
    tipo === 'ricevuta' ? [] : q<any>(`SELECT s.id, d.id AS documento_id, d.numero::text AS numero, coalesce(d.sezionale, '') AS sezionale, to_char(d.data, 'YYYY-MM-DD') AS data_doc,
        to_char(s.data, 'YYYY-MM-DD') AS scadenza, s.importo::float AS importo, s.modalita, to_char(s.pagata_il, 'YYYY-MM-DD') AS pagata_il, s.modo, s.conto,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS controparte, c.partita_iva
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE s.pagata_il >= $1 AND d.tipo = 'fattura' AND ${STATI_OK}`, [dal]),
    tipo === 'emessa' ? [] : q<any>(`SELECT s.id, d.id AS documento_id, coalesce(d.numero, '')::text AS numero, to_char(d.data, 'YYYY-MM-DD') AS data_doc,
        to_char(s.data, 'YYYY-MM-DD') AS scadenza, s.importo::float AS importo, to_char(s.pagata_il, 'YYYY-MM-DD') AS pagata_il, s.modo, s.conto,
        coalesce(f.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS controparte, f.partita_iva
      FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE s.pagata_il >= $1 AND d.tipo = 'fattura'`, [dal]),
  ]);
  return [
    ...emesse.map(r => ({ id: r.id, tipo: 'emessa' as const, documentoId: r.documento_id, numero: r.sezionale ? `${r.numero}/${r.sezionale}` : r.numero,
      dataDoc: r.data_doc, scadenza: r.scadenza, importo: r.importo, controparte: r.controparte, partitaIva: r.partita_iva, riba: r.modalita === 'MP12',
      pagataIl: r.pagata_il, modo: r.modo, conto: r.conto })),
    ...ricevute.map(r => ({ id: r.id, tipo: 'ricevuta' as const, documentoId: r.documento_id, numero: r.numero, dataDoc: r.data_doc, scadenza: r.scadenza,
      importo: r.importo, controparte: r.controparte, partitaIva: r.partita_iva, pagataIl: r.pagata_il, modo: r.modo, conto: r.conto })),
  ].filter(r => !occupate.has(`${r.tipo}:${r.id}`));
}

/** Clienti con l'IBAN della banca d'appoggio (per le RiBa). */
export async function clientiIban(): Promise<{ id: number; ragione_sociale: string; partita_iva: string | null; banca_appoggio: string | null }[]> {
  return q(`SELECT id, ragione_sociale, partita_iva, banca_appoggio FROM clienti ORDER BY ragione_sociale`);
}

/** Scrive l'IBAN della banca d'appoggio del cliente solo se manca o non è un IBAN valido (quello scritto dall'ufficio non si tocca). */
export async function salvaIbanCliente(id: number, iban: string): Promise<'scritto' | 'gia' | 'non valido' | 'cliente?'> {
  const pulito = iban.replace(/\s+/g, '').toUpperCase();
  if (!abiCabDaIban(pulito)) return 'non valido';
  const c = await q1<{ banca_appoggio: string | null }>(`SELECT banca_appoggio FROM clienti WHERE id = $1`, [id]);
  if (!c) return 'cliente?';
  if (c.banca_appoggio && abiCabDaIban(c.banca_appoggio.replace(/\s+/g, ''))) return 'gia';
  await q(`UPDATE clienti SET banca_appoggio = $2 WHERE id = $1`, [id, pulito]);
  return 'scritto';
}

export interface MovimentoDb extends Movimento { id: number; conto: string; stato: string; categoria: string | null; rate: { tipo: string; id: number; gia?: boolean }[]; file: string | null }

const SELECT_MOV = `SELECT id, conto, to_char(data, 'YYYY-MM-DD') AS data, to_char(valuta, 'YYYY-MM-DD') AS valuta, importo::float AS importo,
  descrizione, causale, stato, categoria, rate, file FROM banca_movimenti`;

export async function movimento(id: number): Promise<MovimentoDb | null> {
  return (await q1<MovimentoDb>(`${SELECT_MOV} WHERE id = $1`, [id])) ?? null;
}

/** Movimenti da abbinare con la proposta (rate) o la categoria proposta. Ogni rata è proposta a un solo movimento (il più sicuro). */
export async function movimentiDaAbbinare(): Promise<{ m: MovimentoDb; proposta: Proposta | null; categoria: string }[]> {
  const [movimenti, rate, conti] = await Promise.all([q<MovimentoDb>(`${SELECT_MOV} WHERE stato = 'da_abbinare' ORDER BY data, id`), rateAperte(), contiBanca()]);
  const tecnici = new Set(conti.filter(c => c.tipo === 'anticipo').map(c => c.numero));
  const proposte = movimenti.map(m => ({ m, proposta: proponiAbbinamento(m, rate, { contoTecnico: tecnici.has(m.conto) }) }));
  // la stessa rata non va a due movimenti: tiene il punteggio più alto
  const usate = new Map<string, number>();
  for (const [i, p] of proposte.entries()) for (const r of p.proposta?.rate ?? []) {
    const k = `${r.tipo}:${r.id}`;
    const prima = usate.get(k);
    if (prima == null || (proposte[prima].proposta?.punteggio ?? 0) < p.proposta!.punteggio) usate.set(k, i);
  }
  return proposte.map((p, i) => {
    const libera = p.proposta?.rate.every(r => usate.get(`${r.tipo}:${r.id}`) === i);
    return { m: p.m, proposta: libera ? p.proposta : null, categoria: categoriaProposta(p.m) };
  });
}

/** Modo di pagamento per le rate segnate dal movimento. */
const modoDi = (m: Movimento, riba: boolean) => (riba || /riba|ri\.ba|effett/i.test(m.descrizione) ? 'Ri.Ba.' : 'Bonifico');

/**
 * Abbina il movimento alle rate (ancora aperte e della direzione giusta): le rate diventano incassate/pagate alla data del movimento,
 * con modo e conto. La somma delle rate deve essere l'importo del movimento (al centesimo), salvo `forza` (abbinamento a mano parziale).
 */
export async function abbinaMovimento(id: number, scelte: { tipo: 'emessa' | 'ricevuta'; id: number; gia?: boolean }[], utente: string, forza = false): Promise<string | null> {
  const m = await movimento(id);
  if (!m) return 'Movimento non trovato.';
  if (m.stato !== 'da_abbinare') return 'Movimento già abbinato o registrato.';
  if (!scelte.length) return 'Nessuna fattura scelta.';
  const tipo = m.importo > 0 ? 'emessa' : 'ricevuta';
  if (scelte.some(s => s.tipo !== tipo)) return m.importo > 0 ? 'Un\'entrata si abbina solo a fatture emesse.' : 'Un\'uscita si abbina solo a fatture dei fornitori.';
  const ids = scelte.filter(s => !s.gia).map(s => s.id);
  const aperte = (await rateAperte()).filter(r => r.tipo === tipo && ids.includes(r.id));
  if (aperte.length !== ids.length) return 'Una delle rate è già stata segnata pagata: ricarica la pagina.';
  // rate già segnate pagate prima (storico di Fatture in Cloud): il movimento le conferma, la rata non cambia
  const giaIds = scelte.filter(s => s.gia).map(s => s.id);
  const gia = giaIds.length ? (await ratePagateLibere(tipo)).filter(r => giaIds.includes(r.id)) : [];
  if (gia.length !== giaIds.length) return 'Una delle rate già pagate è collegata a un altro movimento.';
  const somma = [...aperte, ...gia].reduce((s, r) => s + r.importo, 0);
  if (!forza && Math.abs(somma - Math.abs(m.importo)) >= 0.005) return `Le rate scelte fanno ${somma.toFixed(2)} €, il movimento ${Math.abs(m.importo).toFixed(2)} €.`;
  const modo = modoDi(m, aperte.some(r => r.riba || r.distintaId));
  const conto = nomeConto(m.conto, await contiBanca());
  await transazione(async c => {
    const tabella = tipo === 'emessa' ? 'documenti_scadenze' : 'documenti_ricevuti_scadenze';
    if (ids.length) await c.query(`UPDATE ${tabella} SET pagata_il = $2, modo = $3, conto = $4 WHERE id = ANY($1) AND pagata_il IS NULL`, [ids, m.data, modo, conto]);
    if (gia.length) await c.query(`UPDATE ${tabella} SET conto = $2 WHERE id = ANY($1) AND coalesce(conto, '') = ''`, [giaIds, conto]);
    await c.query(`UPDATE banca_movimenti SET stato = 'abbinato', categoria = $2, rate = $3, confermato_il = now(), confermato_da = $4 WHERE id = $1`,
      [id, tipo === 'emessa' ? 'Incasso fattura' : 'Pagamento fattura', JSON.stringify(scelte), utente]);
  });
  return null;
}

/** Movimento senza fattura: solo la categoria. */
export async function registraMovimento(id: number, categoria: string, utente: string): Promise<void> {
  await q(`UPDATE banca_movimenti SET stato = 'registrato', categoria = $2, rate = '[]', confermato_il = now(), confermato_da = $3 WHERE id = $1 AND stato = 'da_abbinare'`,
    [id, categoria, utente]);
}

/** Annulla: le rate segnate da questo movimento tornano aperte (solo se hanno ancora la data del movimento), il movimento torna da abbinare. */
export async function annullaMovimento(id: number): Promise<void> {
  const m = await movimento(id);
  if (!m || m.stato === 'da_abbinare') return;
  await transazione(async c => {
    // le rate già pagate prima del movimento (gia) restano pagate
    const emesse = m.rate.filter(r => r.tipo === 'emessa' && !r.gia).map(r => r.id);
    const ricevute = m.rate.filter(r => r.tipo === 'ricevuta' && !r.gia).map(r => r.id);
    if (emesse.length) await c.query(`UPDATE documenti_scadenze SET pagata_il = NULL, modo = NULL, conto = NULL WHERE id = ANY($1) AND pagata_il = $2`, [emesse, m.data]);
    if (ricevute.length) await c.query(`UPDATE documenti_ricevuti_scadenze SET pagata_il = NULL, modo = NULL, conto = NULL WHERE id = ANY($1) AND pagata_il = $2`, [ricevute, m.data]);
    await c.query(`UPDATE banca_movimenti SET stato = 'da_abbinare', categoria = NULL, rate = '[]', confermato_il = NULL, confermato_da = NULL WHERE id = $1`, [id]);
  });
}

/** Elimina un movimento caricato per sbaglio (solo se non è abbinato). */
export async function eliminaMovimento(id: number): Promise<boolean> {
  return (await q(`DELETE FROM banca_movimenti WHERE id = $1 AND stato <> 'abbinato' RETURNING id`, [id])).length > 0;
}

// ───────────────────────────── RiBa ─────────────────────────────

export async function codiceSia(): Promise<string> {
  return String((await impostazioniBanca()).sia ?? '');
}

export async function salvaCodiceSia(sia: string): Promise<void> {
  await salvaImpostazioniBanca({ sia: sia.toUpperCase().replace(/\s/g, '').slice(0, 5) });
}

export interface RataAnticipo {
  id: number; documento_id: number; numero: string; data_doc: string; scadenza: string; importo: number; modalita: string;
  cliente: string; cliente_id: number | null; partita_iva: string | null; codice_fiscale: string | null; indirizzo: string | null; cap: string | null;
  comune: string | null; provincia: string | null; banca_appoggio: string | null; riba_distinta_id: number | null;
}

/** Rate aperte delle fatture emesse con scadenza da oggi in avanti (le RiBa e i bonifici da anticipare). */
export async function rateDaAnticipare(): Promise<RataAnticipo[]> {
  return q<RataAnticipo>(`SELECT s.id, d.id AS documento_id, d.numero::text || CASE WHEN coalesce(d.sezionale, '') <> '' THEN '/' || d.sezionale ELSE '' END AS numero,
      to_char(d.data, 'YYYY-MM-DD') AS data_doc, to_char(s.data, 'YYYY-MM-DD') AS scadenza, s.importo::float AS importo, s.modalita,
      coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', '') AS cliente, c.id AS cliente_id, c.partita_iva, c.codice_fiscale,
      c.indirizzo, c.cap, c.comune, c.provincia, c.banca_appoggio, s.riba_distinta_id
    FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' AND ${STATI_OK} AND s.data >= current_date AND s.importo > 0
    ORDER BY s.data, d.numero`);
}

export function effettoDa(r: RataAnticipo): EffettoRiba {
  return { rataId: r.id, scadenza: r.scadenza, importo: r.importo, numeroFattura: r.numero, dataFattura: r.data_doc,
    debitore: { nome: r.cliente, codiceFiscale: r.partita_iva || r.codice_fiscale || '', indirizzo: r.indirizzo ?? '', cap: r.cap ?? '', comune: r.comune ?? '',
      provincia: r.provincia ?? '', iban: r.banca_appoggio, banca: abiCabDaIban(r.banca_appoggio) ? null : r.banca_appoggio } };
}

export async function creditore(): Promise<CreditoreRiba> {
  const az = (await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
  return { sia: await codiceSia(), ragioneSociale: az.ragione_sociale ?? '', indirizzo: az.indirizzo ?? '', cap: az.cap ?? '', comune: az.comune ?? '',
    provincia: az.provincia ?? '', partitaIva: az.partita_iva ?? '', iban: az.iban ?? '' };
}

/** Crea la distinta RiBa con le rate scelte: errori (niente file) oppure id della distinta. */
export async function creaDistinta(ids: number[], utente: string, oggi: string): Promise<{ id?: number; errori: string[] }> {
  const cred = await creditore();
  const errori = controlliCreditore(cred);
  const rate = (await rateDaAnticipare()).filter(r => ids.includes(r.id));
  if (!rate.length) errori.push('Nessuna rata scelta (o già incassata).');
  for (const r of rate) {
    if (r.riba_distinta_id) errori.push(`Fattura ${r.numero} (${r.cliente}): già nella distinta n. ${r.riba_distinta_id}.`);
    for (const e of controlliEffetto(effettoDa(r), oggi)) errori.push(`Fattura ${r.numero} (${r.cliente}): ${e}.`);
  }
  if (errori.length) return { errori };
  return transazione(async c => {
    const nuova = (await c.query(`INSERT INTO riba_distinte (creata_da, nome_supporto, quante, totale, file) VALUES ($1, '', $2, $3, '') RETURNING id`,
      [utente, rate.length, rate.reduce((s, r) => s + r.importo, 0)])).rows[0].id as number;
    const supporto = `RIBA${oggi.replace(/-/g, '')}${String(nuova).padStart(4, '0')}`;
    const file = generaRiba(cred, rate.map(effettoDa), oggi, supporto);
    await c.query(`UPDATE riba_distinte SET nome_supporto = $2, file = $3 WHERE id = $1`, [nuova, supporto, file]);
    await c.query(`UPDATE documenti_scadenze SET riba_distinta_id = $2 WHERE id = ANY($1)`, [rate.map(r => r.id), nuova]);
    return { id: nuova, errori: [] };
  });
}

export async function distinte() {
  return q<{ id: number; creata_il: string; creata_da: string; nome_supporto: string; quante: number; totale: number; annullata: boolean; incassate: number }>(
    `SELECT r.id, to_char(r.creata_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS creata_il, r.creata_da, r.nome_supporto, r.quante, r.totale::float AS totale, r.annullata,
       (SELECT count(*)::int FROM documenti_scadenze s WHERE s.riba_distinta_id = r.id AND s.pagata_il IS NOT NULL) AS incassate
     FROM riba_distinte r ORDER BY r.id DESC LIMIT 50`);
}

/** Annulla la distinta (la banca non l'ha presa): le rate si possono rimettere in un'altra distinta. */
export async function annullaDistinta(id: number): Promise<void> {
  await transazione(async c => {
    await c.query(`UPDATE riba_distinte SET annullata = true WHERE id = $1`, [id]);
    await c.query(`UPDATE documenti_scadenze SET riba_distinta_id = NULL WHERE riba_distinta_id = $1 AND pagata_il IS NULL`, [id]);
  });
}

/**
 * Fatture anticipate dalla banca, anche già incassate (Adriano 8/11/2026): movimenti dei conti di anticipo contro le fatture emesse.
 * `ids` = solo queste fatture (elenco, pagina della fattura). Calcolato in lettura, niente tabelle.
 */
export async function anticipiFatture(ids?: number[]): Promise<Map<number, AnticipoFattura[]>> {
  if (ids && !ids.length) return new Map();
  const tecnici = (await contiBanca()).filter(c => c.tipo === 'anticipo').map(c => c.numero);
  if (!tecnici.length) return new Map();
  const movimenti = await q<{ data: string; importo: number; descrizione: string; conto: string }>(`SELECT to_char(data, 'YYYY-MM-DD') AS data,
      importo::float AS importo, descrizione, conto FROM banca_movimenti WHERE conto = ANY($1)`, [tecnici]);
  if (!movimenti.length) return new Map();
  const dal = movimenti.reduce((m, x) => (x.data < m ? x.data : m), '9999');
  const righe = await q<{ id: number; numero: number; data: string; cliente: string | null; sid: number | null; scadenza: string | null; importo: number | null; modalita: string | null; pagata: string | null }>(
    `SELECT d.id, d.numero, to_char(d.data, 'YYYY-MM-DD') AS data, coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale') AS cliente, s.id AS sid, to_char(s.data, 'YYYY-MM-DD') AS scadenza, s.importo::float AS importo, s.modalita, to_char(s.pagata_il, 'YYYY-MM-DD') AS pagata
      FROM documenti d LEFT JOIN documenti_scadenze s ON s.documento_id = d.id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = 'fattura' AND d.numero IS NOT NULL AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND d.data >= $1::date - 365`, [dal]);
  const fatture = new Map<number, FatturaPerAnticipi>();
  for (const r of righe) {
    const f = fatture.get(r.id) ?? { id: r.id, numero: String(r.numero), data: r.data, cliente: r.cliente, rate: [] };
    if (r.sid && r.scadenza && r.importo != null) f.rate.push({ id: r.sid, scadenza: r.scadenza, importo: r.importo, riba: r.modalita === 'MP12', pagata: r.pagata });
    fatture.set(r.id, f);
  }
  const tutte = anticipiDelleFatture(movimenti, [...fatture.values()]);
  if (!ids) return tutte;
  return new Map(ids.filter(id => tutte.has(id)).map(id => [id, tutte.get(id)!]));
}

/** Rate delle fatture con il movimento di banca che le ha pagate (colonna "Incasso" delle Fatture, Adriano 9/11/2026). */
export async function incassiFatture(ids: number[]): Promise<Map<number, RataIncasso[]>> {
  if (!ids.length) return new Map();
  const [rate, conti] = await Promise.all([
    q<{ documento_id: number; id: number; scadenza: string; importo: number; pagata: string | null; modo: string | null }>(
      `SELECT documento_id, id, to_char(data, 'YYYY-MM-DD') AS scadenza, importo::float AS importo, to_char(pagata_il, 'YYYY-MM-DD') AS pagata, modo
       FROM documenti_scadenze WHERE documento_id = ANY($1) ORDER BY data, id`, [ids]),
    contiBanca()]);
  const movimenti = rate.some(r => r.pagata) ? await q<{ rata: number; data: string; conto: string }>(
    `SELECT (x->>'id')::int AS rata, to_char(m.data, 'YYYY-MM-DD') AS data, m.conto FROM banca_movimenti m, jsonb_array_elements(m.rate) x
     WHERE coalesce(x->>'tipo', 'emessa') = 'emessa' AND (x->>'id')::int = ANY($1)`, [rate.filter(r => r.pagata).map(r => r.id)]) : [];
  const perRata = new Map(movimenti.map(m => [m.rata, { data: m.data, conto: nomeConto(m.conto, conti) }]));
  const esito = new Map<number, RataIncasso[]>();
  for (const r of rate) esito.set(r.documento_id, [...(esito.get(r.documento_id) ?? []),
    { scadenza: r.scadenza, importo: r.importo, pagata: r.pagata, modo: r.modo, movimento: perRata.get(r.id) ?? null }]);
  return esito;
}

/** Aggiunge la rata a una fattura emessa che non ne ha (vedi `rataMancante`). Risposta: id della rata nuova, o il motivo. */
export async function aggiungiRataMancante(anno: number, numero: number): Promise<{ id: number } | { errore: string }> {
  const f = await q1<{ id: number; tipo: string; stato: string; numero: number; data: string; totale: number | null; rate: number }>(
    `SELECT d.id, d.tipo, d.stato, d.numero, to_char(d.data, 'YYYY-MM-DD') AS data, d.totale::float AS totale,
       (SELECT count(*)::int FROM documenti_scadenze s WHERE s.documento_id = d.id) AS rate
     FROM documenti d WHERE d.tipo = 'fattura' AND d.anno = $1 AND d.numero = $2 AND coalesce(d.sezionale, '') = '' LIMIT 1`, [anno, numero]);
  if (!f) return { errore: 'fattura non trovata' };
  const r = rataMancante(f);
  if (!r) return { errore: f.rate ? 'la fattura ha già le sue rate' : 'fattura non adatta (bozza, annullata o senza totale)' };
  const nuova = await q1<{ id: number }>(`INSERT INTO documenti_scadenze (documento_id, data, importo, modalita) VALUES ($1, $2, $3, $4) RETURNING id`,
    [f.id, r.data, r.importo, r.modalita]);
  return { id: nuova!.id };
}
