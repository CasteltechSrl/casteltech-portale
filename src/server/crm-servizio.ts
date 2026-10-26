/**
 * CRM nel database: import dal file preparato da Claude (CRM_Database_Clienti di Adriano, senza le vecchie attività),
 * clienti dell'anagrafica sempre presenti nel CRM, ricerca delle aziende.
 */
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import { q, transazione } from './db.js';
import { maiuscolo } from './anagrafiche-servizio.js';
import { chiaveNome, fasciaFatturato, formatta, mediaAnnua, statoDa, statoDopoImport, TIPI_ATTIVITA, trovaCliente, unisciElenco, type ClientePerCollegamento, type StatoCrm } from '../engine/crm.js';

type Db = Pick<pg.PoolClient, 'query'>;

/** File di import: una riga per azienda con i suoi referenti. */
export interface FileCrm {
  aziende: {
    codice: string; ragione_sociale: string; stato?: string | null;
    settore?: string | null; descrizione?: string | null; indirizzo?: string | null; cap?: string | null; citta?: string | null;
    provincia?: string | null; regione?: string | null; paese?: string | null; partita_iva?: string | null;
    telefono?: string | null; altri_telefoni?: string | null; email?: string | null; altre_email?: string | null; sito?: string | null;
    altri_nomi?: string | null; ateco?: string | null; dipendenti?: number | null; fatturato?: number | null; note?: string | null;
    da_verificare?: string | null;   // motivo del dubbio: l'azienda va nella lista "Da verificare"
    responsabile?: string | null; prossima_azione?: string | null; data_prossima_azione?: string | null;
    scollega_cliente?: boolean;      // era collegata per sbaglio (solo per nome) a un cliente dell'anagrafica
    attivita?: { data: string; tipo: string; descrizione: string; referente?: string | null }[];
    contatti?: { codice: string; nome: string; ruolo?: string | null; telefono?: string | null; altri_telefoni?: string | null; email?: string | null; note?: string | null }[];
  }[];
}

export function leggiFileCrm(contenuto: Buffer): FileCrm {
  const testo = contenuto[0] === 0x1f && contenuto[1] === 0x8b ? gunzipSync(contenuto).toString('utf8') : contenuto.toString('utf8');
  const f = JSON.parse(testo) as FileCrm;
  if (!Array.isArray(f.aziende) || f.aziende.some(a => !a.codice || !a.ragione_sociale)) throw new Error('servono "aziende" con codice e ragione sociale');
  return f;
}

/**
 * I clienti dell'anagrafica che non sono ancora nel CRM: se un'azienda del CRM ha la stessa partita IVA o lo stesso nome
 * (ed è l'unica) diventa quel cliente, altrimenti il cliente entra come nuova azienda "Cliente".
 */
export async function allineaClienti(c?: Db) {
  const esegui = (sql: string, p: unknown[] = []) => (c ? c.query(sql, p).then(r => r.rows) : q(sql, p));
  const liberi: ClientePerCollegamento[] = await esegui(`SELECT c.id, c.ragione_sociale, c.partita_iva,
      coalesce(array_agg(a.nome) FILTER (WHERE a.nome IS NOT NULL), '{}') AS alias
    FROM clienti c LEFT JOIN alias_clienti a ON a.cliente_id = c.id
    WHERE NOT EXISTS (SELECT 1 FROM crm_aziende x WHERE x.cliente_id = c.id) GROUP BY c.id`);
  if (!liberi.length) return;
  const aziende: { id: number; ragione_sociale: string; partita_iva: string | null }[] =
    await esegui(`SELECT id, ragione_sociale, partita_iva FROM crm_aziende WHERE cliente_id IS NULL AND da_verificare IS NULL AND stato <> 'scartato'`);
  for (const cl of liberi) {
    const uguali = aziende.filter(a => trovaCliente(a, [cl]));
    if (uguali.length === 1) {
      await esegui(`UPDATE crm_aziende SET cliente_id = $2, stato = 'cliente', aggiornato_il = now() WHERE id = $1`, [uguali[0].id, cl.id]);
      aziende.splice(aziende.indexOf(uguali[0]), 1);
    } else {
      await esegui(`INSERT INTO crm_aziende (ragione_sociale, cliente_id, stato, partita_iva) VALUES ($1, $2, 'cliente', $3)`, [cl.ragione_sociale, cl.id, cl.partita_iva]);
    }
  }
}

async function clientiPerCollegamento(c: Db): Promise<ClientePerCollegamento[]> {
  return (await c.query(`
    SELECT c.id, c.ragione_sociale, c.partita_iva, coalesce(array_agg(a.nome) FILTER (WHERE a.nome IS NOT NULL), '{}') AS alias
    FROM clienti c LEFT JOIN alias_clienti a ON a.cliente_id = c.id GROUP BY c.id ORDER BY c.id`)).rows;
}

const testo = (v: unknown) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t || null; };
const intero = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null);

/**
 * Import (si può ripetere): le aziende si aggiornano per codice. Restano i dati scritti nel portale
 * (priorità, responsabile, prossima azione, attività, aziende già confermate o scartate): il file riempie solo i campi vuoti,
 * aggiunge altri nomi, telefoni, email e note che mancano, cambia lo stato solo alle aziende ancora "Da contattare",
 * mette la prossima azione solo dove non ce n'è una e aggiunge le attività che non ci sono già (stessa data, tipo e testo).
 * Un'azienda con la stessa partita IVA o lo stesso nome di un cliente in anagrafica si collega a quel cliente (stato Cliente).
 * Con anteprima non scrive niente e dice cosa farebbe.
 */
export async function importaCrm(f: FileCrm, opz: { anteprima: boolean }) {
  return transazione(async c => {
    const clienti = await clientiPerCollegamento(c);
    type Esistente = { id: number; cliente_id: number | null; stato: StatoCrm; altri_nomi: string | null; altri_telefoni: string | null; altre_email: string | null; note: string | null };
    const esistenti = new Map<string, Esistente>((await c.query(`SELECT codice, id, cliente_id, stato, altri_nomi, altri_telefoni, altre_email, note
      FROM crm_aziende WHERE codice IS NOT NULL`)).rows.map((r: any) => [r.codice, r]));
    // collegamenti sbagliati da togliere prima di cercare i clienti
    const scollegate: string[] = [];
    for (const a of f.aziende) {
      const e = esistenti.get(a.codice);
      if (a.scollega_cliente && e?.cliente_id) {
        scollegate.push(`${maiuscolo(a.ragione_sociale)} (${a.codice})`);
        esistenti.set(a.codice, { ...e, cliente_id: null, stato: e.stato === 'cliente' ? 'da_contattare' : e.stato });
      }
    }
    // clienti già collegati a un'azienda del file (import precedente o collegamento a mano)
    const presi = new Map<number, string>([...esistenti].filter(([, e]) => e.cliente_id).map(([codice, e]) => [e.cliente_id!, codice]));

    const collegate: { azienda: string; cliente: string; come: string }[] = [];
    const conflitti: string[] = [];
    const righe = f.aziende.map(a => {
      const esiste = esistenti.get(a.codice);
      let clienteId: number | null = null, daVerificare = testo(a.da_verificare);
      if (!esiste?.cliente_id && !a.scollega_cliente) {
        const t = trovaCliente(a, clienti);
        if (t) {
          const altro = presi.get(t.cliente.id);
          if (altro && altro !== a.codice) {
            conflitti.push(`${maiuscolo(a.ragione_sociale)} (${a.codice}): ${t.cliente.ragione_sociale} è già collegato a ${altro}`);
            daVerificare = [daVerificare, `Sembra il cliente ${t.cliente.ragione_sociale}, già collegato a ${altro}`].filter(Boolean).join('; ');
          } else {
            clienteId = t.cliente.id;
            presi.set(t.cliente.id, a.codice);
            daVerificare = null;  // un cliente in anagrafica non è un dubbio
            collegate.push({ azienda: maiuscolo(a.ragione_sociale), cliente: t.cliente.ragione_sociale, come: t.come === 'partita_iva' ? 'partita IVA' : 'nome' });
          }
        }
      }
      const unisci = (k: 'altri_nomi' | 'altri_telefoni' | 'altre_email' | 'note') => unisciElenco(esiste?.[k], formatta(k, a[k]), k === 'note' ? '\n' : ' | ');
      const prossima = formatta('prossima_azione', a.prossima_azione);
      const dataProssima = /^\d{4}-\d{2}-\d{2}$/.test(String(a.data_prossima_azione ?? '')) ? a.data_prossima_azione! : null;
      return {
        codice: a.codice, ragione_sociale: formatta('ragione_sociale', a.ragione_sociale)!, cliente_id: clienteId,
        stato: clienteId ? 'cliente' : esiste ? statoDopoImport(esiste.stato, statoDa(a.stato)) : statoDa(a.stato) ?? 'da_contattare',
        responsabile: formatta('responsabile', a.responsabile), prossima_azione: prossima ?? (dataProssima ? 'Da fare' : null), data_prossima_azione: dataProssima,
        settore: formatta('settore', a.settore), descrizione: formatta('descrizione', a.descrizione), indirizzo: formatta('indirizzo', a.indirizzo), cap: formatta('cap', a.cap), citta: formatta('citta', a.citta),
        provincia: formatta('provincia', a.provincia), regione: formatta('regione', a.regione), paese: formatta('paese', a.paese), partita_iva: formatta('partita_iva', a.partita_iva),
        telefono: formatta('telefono', a.telefono), altri_telefoni: unisci('altri_telefoni'), email: formatta('email', a.email),
        altre_email: unisci('altre_email'), sito: formatta('sito', a.sito), altri_nomi: unisci('altri_nomi'), ateco: formatta('ateco', a.ateco),
        dipendenti: intero(a.dipendenti), fatturato: intero(a.fatturato), note: unisci('note'), da_verificare: daVerificare,
      };
    });
    const contatti = f.aziende.flatMap(a => (a.contatti ?? []).filter(k => k.codice && testo(k.nome)).map(k => ({
      azienda: a.codice, codice: k.codice, nome: formatta('nome', k.nome)!, ruolo: formatta('ruolo', k.ruolo), telefono: formatta('telefono', k.telefono), altri_telefoni: formatta('altri_telefoni', k.altri_telefoni),
      email: formatta('email', k.email), note: formatta('note', k.note),
    })));
    const attivita = f.aziende.flatMap(a => (a.attivita ?? [])
      .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(String(x.data)) && x.tipo in TIPI_ATTIVITA && formatta('descrizione_attivita', x.descrizione))
      .map(x => ({ azienda: a.codice, data: x.data, tipo: x.tipo, referente: formatta('referente', x.referente), descrizione: formatta('descrizione_attivita', x.descrizione)! })));
    const esito = {
      aziende: righe.length, nuove: righe.filter(r => !esistenti.has(r.codice)).length,
      daVerificare: righe.filter(r => r.da_verificare && !esistenti.has(r.codice)).length,
      contatti: contatti.length, attivita: attivita.length, prossimeAzioni: righe.filter(r => r.prossima_azione).length,
      collegate, conflitti, scollegate,
    };
    if (opz.anteprima) return esito;

    if (scollegate.length) await c.query(`UPDATE crm_aziende SET cliente_id = NULL, stato = CASE WHEN stato = 'cliente' THEN 'da_contattare' ELSE stato END,
      aggiornato_il = now() WHERE codice = ANY($1) AND cliente_id IS NOT NULL`, [f.aziende.filter(a => a.scollega_cliente).map(a => a.codice)]);

    // un cliente entrato da solo nel CRM (senza codice) diventa l'azienda del file: restano le sue attività
    const unisci = righe.filter(r => r.cliente_id);
    if (unisci.length) await c.query(`
      UPDATE crm_aziende a SET codice = x.codice FROM jsonb_to_recordset($1) AS x(codice text, cliente_id int)
      WHERE a.cliente_id = x.cliente_id AND a.codice IS NULL`, [JSON.stringify(unisci.map(r => ({ codice: r.codice, cliente_id: r.cliente_id })))]);

    // altri nomi, telefoni, email e note arrivano già uniti a quelli del portale: per tutti i campi vince il valore del portale se c'è
    const campi = ['settore', 'descrizione', 'indirizzo', 'cap', 'citta', 'provincia', 'regione', 'paese', 'partita_iva', 'telefono', 'email', 'sito', 'ateco',
      'dipendenti', 'fatturato', 'responsabile'];
    const uniti = ['altri_telefoni', 'altre_email', 'altri_nomi', 'note'];
    await c.query(`
      INSERT INTO crm_aziende (codice, ragione_sociale, cliente_id, stato, ${campi.join(', ')}, ${uniti.join(', ')}, da_verificare, prossima_azione, data_prossima_azione)
      SELECT codice, ragione_sociale, cliente_id, stato, ${campi.join(', ')}, ${uniti.join(', ')}, da_verificare, prossima_azione, data_prossima_azione
      FROM jsonb_to_recordset($1) AS x(codice text, ragione_sociale text, cliente_id int, stato text, settore text, descrizione text, indirizzo text,
        cap text, citta text, provincia text, regione text, paese text, partita_iva text, telefono text, altri_telefoni text, email text, altre_email text,
        sito text, altri_nomi text, ateco text, dipendenti int, fatturato numeric, responsabile text, note text, da_verificare text,
        prossima_azione text, data_prossima_azione date)
      ON CONFLICT (codice) DO UPDATE SET
        ragione_sociale = CASE WHEN crm_aziende.cliente_id IS NULL THEN EXCLUDED.ragione_sociale ELSE crm_aziende.ragione_sociale END,
        cliente_id = coalesce(crm_aziende.cliente_id, EXCLUDED.cliente_id),
        stato = CASE WHEN crm_aziende.cliente_id IS NULL AND EXCLUDED.cliente_id IS NOT NULL THEN 'cliente' ELSE EXCLUDED.stato END,
        da_verificare = CASE WHEN EXCLUDED.cliente_id IS NOT NULL THEN NULL ELSE crm_aziende.da_verificare END,
        ${campi.map(k => `${k} = coalesce(crm_aziende.${k}, EXCLUDED.${k})`).join(', ')},
        ${uniti.map(k => `${k} = coalesce(EXCLUDED.${k}, crm_aziende.${k})`).join(', ')},
        prossima_azione = CASE WHEN crm_aziende.prossima_azione IS NULL AND crm_aziende.data_prossima_azione IS NULL THEN EXCLUDED.prossima_azione ELSE crm_aziende.prossima_azione END,
        data_prossima_azione = CASE WHEN crm_aziende.prossima_azione IS NULL AND crm_aziende.data_prossima_azione IS NULL THEN EXCLUDED.data_prossima_azione ELSE crm_aziende.data_prossima_azione END,
        aggiornato_il = now()`, [JSON.stringify(righe)]);

    // attività del file che non ci sono già; l'ultimo contatto è la data più recente (le note non contano)
    await c.query(`
      INSERT INTO crm_attivita (azienda_id, data, tipo, referente, descrizione)
      SELECT a.id, x.data, x.tipo, x.referente, x.descrizione
      FROM jsonb_to_recordset($1) AS x(azienda text, data date, tipo text, referente text, descrizione text)
      JOIN crm_aziende a ON a.codice = x.azienda
      WHERE NOT EXISTS (SELECT 1 FROM crm_attivita z WHERE z.azienda_id = a.id AND z.data = x.data AND z.tipo = x.tipo AND z.descrizione = x.descrizione)`,
      [JSON.stringify(attivita)]);
    await c.query(`
      UPDATE crm_aziende a SET ultimo_contatto = greatest(a.ultimo_contatto, x.data)
      FROM (SELECT azienda, max(data) AS data FROM jsonb_to_recordset($1) AS y(azienda text, data date, tipo text) WHERE tipo <> 'nota' GROUP BY azienda) x
      WHERE a.codice = x.azienda`, [JSON.stringify(attivita)]);

    await c.query(`
      INSERT INTO crm_contatti (azienda_id, codice, nome, ruolo, telefono, altri_telefoni, email, note)
      SELECT a.id, x.codice, x.nome, x.ruolo, x.telefono, x.altri_telefoni, x.email, x.note
      FROM jsonb_to_recordset($1) AS x(azienda text, codice text, nome text, ruolo text, telefono text, altri_telefoni text, email text, note text)
      JOIN crm_aziende a ON a.codice = x.azienda
      ON CONFLICT (codice) DO UPDATE SET ruolo = coalesce(crm_contatti.ruolo, EXCLUDED.ruolo), telefono = coalesce(crm_contatti.telefono, EXCLUDED.telefono),
        altri_telefoni = coalesce(crm_contatti.altri_telefoni, EXCLUDED.altri_telefoni), email = coalesce(crm_contatti.email, EXCLUDED.email),
        note = coalesce(crm_contatti.note, EXCLUDED.note)`, [JSON.stringify(contatti)]);

    await allineaClienti(c);
    return esito;
  });
}

// ───────────────────────────── ricerca ─────────────────────────────
export interface FiltriCrm { testo?: string; stato?: string; provincia?: string; responsabile?: string; soloAzioni?: boolean; verificare?: boolean }

/**
 * Aziende che corrispondono alla ricerca: ogni parola scritta deve comparire in nome, altri nomi, città, provincia,
 * partita IVA, telefoni, email, sito, settore o nei referenti. Le scartate si vedono solo cercandole per stato.
 */
export async function cercaAziende(f: FiltriCrm, limite = 200) {
  const parole = String(f.testo ?? '').trim().split(/\s+/).filter(Boolean).map(p => p.replace(/[\\%_]/g, m => '\\' + m));
  return q(`
    SELECT a.id, coalesce(cl.ragione_sociale, a.ragione_sociale) AS nome, a.cliente_id, a.stato, a.priorita, a.responsabile, a.citta, a.provincia,
      a.telefono, a.email, a.prossima_azione, a.data_prossima_azione, a.ultimo_contatto, a.da_verificare,
      (SELECT k.nome FROM crm_contatti k WHERE k.azienda_id = a.id ORDER BY k.codice NULLS LAST, k.id LIMIT 1) AS referente
    FROM crm_aziende a LEFT JOIN clienti cl ON cl.id = a.cliente_id
    WHERE ($1::boolean AND a.da_verificare IS NOT NULL OR NOT $1::boolean AND a.da_verificare IS NULL)
      AND ($2 = '' AND a.stato <> 'scartato' OR a.stato = $2)
      AND ($3 = '' OR a.provincia = $3)
      AND ($4 = '' OR a.responsabile = $4)
      AND (NOT $5::boolean OR a.data_prossima_azione IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM unnest($6::text[]) AS p(parola)
        WHERE concat_ws(' ', a.ragione_sociale, cl.ragione_sociale, a.altri_nomi, a.citta, a.provincia, a.partita_iva, a.telefono, a.altri_telefoni,
          a.email, a.altre_email, a.sito, a.settore, a.descrizione,
          (SELECT string_agg(concat_ws(' ', k.nome, k.telefono, k.email), ' ') FROM crm_contatti k WHERE k.azienda_id = a.id)) NOT ILIKE '%' || p.parola || '%')
    ORDER BY a.data_prossima_azione NULLS LAST, (a.cliente_id IS NULL), coalesce(cl.ragione_sociale, a.ragione_sociale)
    LIMIT $7`, [!!f.verificare, f.stato ?? '', String(f.provincia ?? '').trim().toUpperCase(), f.responsabile ?? '', !!f.soloAzioni, parole, limite]);
}

/** Un'azienda del CRM con lo stesso nome (forma giuridica a parte): per non crearne due uguali. */
export async function aziendaConNome(nome: string) {
  const k = chiaveNome(nome);
  const righe = await q<{ id: number; ragione_sociale: string }>(`SELECT a.id, coalesce(cl.ragione_sociale, a.ragione_sociale) AS ragione_sociale
    FROM crm_aziende a LEFT JOIN clienti cl ON cl.id = a.cliente_id`);
  return righe.find(r => chiaveNome(r.ragione_sociale) === k);
}

// ───────────────────────────── fatturato dei clienti ─────────────────────────────
/** File: totale fatturato per cliente (nome come nelle fatture) e anno, dagli export di Fatture in Cloud. */
export interface FileFatturato { fatturato: { cliente: string; anno: number; importo: number }[] }

export function leggiFileFatturato(contenuto: Buffer): FileFatturato {
  const testo = contenuto[0] === 0x1f && contenuto[1] === 0x8b ? gunzipSync(contenuto).toString('utf8') : contenuto.toString('utf8');
  const f = JSON.parse(testo) as FileFatturato;
  if (!Array.isArray(f.fatturato) || f.fatturato.some(r => !r.cliente || !Number.isInteger(r.anno) || !Number.isFinite(Number(r.importo))))
    throw new Error('serve "fatturato" con cliente, anno e importo');
  return f;
}

/** Sostituisce gli anni presenti nel file; i nomi si collegano ai clienti in anagrafica (nome, nomi vecchi, forma giuridica a parte). */
export async function importaFatturato(f: FileFatturato) {
  return transazione(async c => {
    const clienti = await clientiPerCollegamento(c);
    const anni = [...new Set(f.fatturato.map(r => r.anno))];
    const righe = new Map<string, { cliente_nome: string; anno: number; importo: number; cliente_id: number | null }>();
    const fuori = new Set<string>();
    for (const r of f.fatturato) {
      const nome = maiuscolo(r.cliente);
      const t = trovaCliente({ ragione_sociale: nome }, clienti);
      if (!t) fuori.add(nome);
      const k = `${nome}|${r.anno}`;
      const prima = righe.get(k);
      righe.set(k, { cliente_nome: nome, anno: r.anno, importo: (prima?.importo ?? 0) + Number(r.importo), cliente_id: t?.cliente.id ?? null });
    }
    await c.query(`DELETE FROM fatturato_clienti WHERE anno = ANY($1::int[])`, [anni]);
    await c.query(`INSERT INTO fatturato_clienti (cliente_nome, anno, importo, cliente_id)
      SELECT cliente_nome, anno, importo, cliente_id FROM jsonb_to_recordset($1) AS x(cliente_nome text, anno int, importo numeric, cliente_id int)`,
      [JSON.stringify([...righe.values()])]);
    return { anni: anni.sort(), clienti: new Set([...righe.values()].map(r => r.cliente_nome)).size, nonInAnagrafica: [...fuori].sort() };
  });
}

export interface FatturatoCliente { perAnno: Record<number, number>; media: number; fascia: string }

/** Fatturato per cliente dell'anagrafica: importi per anno, media annua sugli anni caricati e fascia. */
export async function fatturatoClienti(clienteIds?: number[]): Promise<{ anni: number[]; perCliente: Map<number, FatturatoCliente> }> {
  const anni = (await q<{ anno: number }>(`SELECT DISTINCT anno FROM fatturato_clienti ORDER BY anno`)).map(r => r.anno);
  const righe = await q<{ cliente_id: number; anno: number; importo: number }>(`SELECT cliente_id, anno, sum(importo)::float AS importo FROM fatturato_clienti
    WHERE cliente_id IS NOT NULL AND ($1::int[] IS NULL OR cliente_id = ANY($1)) GROUP BY cliente_id, anno`, [clienteIds ?? null]);
  const perCliente = new Map<number, FatturatoCliente>();
  for (const r of righe) {
    const x = perCliente.get(r.cliente_id) ?? { perAnno: {}, media: 0, fascia: '' };
    x.perAnno[r.anno] = r.importo;
    perCliente.set(r.cliente_id, x);
  }
  for (const x of perCliente.values()) { x.media = mediaAnnua(x.perAnno, anni); x.fascia = fasciaFatturato(x.media); }
  return { anni, perCliente };
}
