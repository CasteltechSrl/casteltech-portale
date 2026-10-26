/**
 * CRM nel database: import dal file preparato da Claude (CRM_Database_Clienti di Adriano, senza le vecchie attività),
 * clienti dell'anagrafica sempre presenti nel CRM, ricerca delle aziende.
 */
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import { q, transazione } from './db.js';
import { maiuscolo } from './anagrafiche-servizio.js';
import { chiaveNome, statoDa, trovaCliente, type ClientePerCollegamento } from '../engine/crm.js';

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
    contatti?: { codice: string; nome: string; ruolo?: string | null; telefono?: string | null; altri_telefoni?: string | null; email?: string | null; note?: string | null }[];
  }[];
}

export function leggiFileCrm(contenuto: Buffer): FileCrm {
  const testo = contenuto[0] === 0x1f && contenuto[1] === 0x8b ? gunzipSync(contenuto).toString('utf8') : contenuto.toString('utf8');
  const f = JSON.parse(testo) as FileCrm;
  if (!Array.isArray(f.aziende) || f.aziende.some(a => !a.codice || !a.ragione_sociale)) throw new Error('servono "aziende" con codice e ragione sociale');
  return f;
}

/** I clienti dell'anagrafica che non sono ancora nel CRM vi entrano come "Cliente". */
export async function allineaClienti(c?: Db) {
  const sql = `
    INSERT INTO crm_aziende (ragione_sociale, cliente_id, stato, partita_iva)
    SELECT c.ragione_sociale, c.id, 'cliente', c.partita_iva FROM clienti c
    WHERE NOT EXISTS (SELECT 1 FROM crm_aziende a WHERE a.cliente_id = c.id)`;
  await (c ? c.query(sql) : q(sql));
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
 * (stato, priorità, responsabile, prossima azione, attività, aziende già confermate o scartate): il file riempie solo i campi vuoti.
 * Un'azienda con la stessa partita IVA o lo stesso nome di un cliente in anagrafica si collega a quel cliente (stato Cliente).
 * Con anteprima non scrive niente e dice cosa farebbe.
 */
export async function importaCrm(f: FileCrm, opz: { anteprima: boolean }) {
  return transazione(async c => {
    const clienti = await clientiPerCollegamento(c);
    const esistenti = new Map<string, { id: number; cliente_id: number | null }>(
      (await c.query(`SELECT codice, id, cliente_id FROM crm_aziende WHERE codice IS NOT NULL`)).rows.map((r: any) => [r.codice, r]));
    // clienti già collegati a un'azienda del file (import precedente o collegamento a mano)
    const presi = new Map<number, string>(
      (await c.query(`SELECT cliente_id, codice FROM crm_aziende WHERE cliente_id IS NOT NULL AND codice IS NOT NULL`)).rows.map((r: any) => [r.cliente_id, r.codice]));

    const collegate: { azienda: string; cliente: string; come: string }[] = [];
    const conflitti: string[] = [];
    const righe = f.aziende.map(a => {
      const esiste = esistenti.get(a.codice);
      let clienteId: number | null = null, daVerificare = testo(a.da_verificare);
      if (!esiste?.cliente_id) {
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
      return {
        codice: a.codice, ragione_sociale: maiuscolo(a.ragione_sociale), cliente_id: clienteId,
        stato: clienteId ? 'cliente' : statoDa(a.stato) ?? 'da_contattare',
        settore: testo(a.settore), descrizione: testo(a.descrizione), indirizzo: testo(a.indirizzo), cap: testo(a.cap), citta: testo(a.citta),
        provincia: testo(a.provincia)?.toUpperCase() ?? null, regione: testo(a.regione), paese: testo(a.paese), partita_iva: testo(a.partita_iva),
        telefono: testo(a.telefono), altri_telefoni: testo(a.altri_telefoni), email: testo(a.email)?.toLowerCase() ?? null,
        altre_email: testo(a.altre_email)?.toLowerCase() ?? null, sito: testo(a.sito), altri_nomi: testo(a.altri_nomi), ateco: testo(a.ateco),
        dipendenti: intero(a.dipendenti), fatturato: intero(a.fatturato), note: testo(a.note), da_verificare: daVerificare,
      };
    });
    const contatti = f.aziende.flatMap(a => (a.contatti ?? []).filter(k => k.codice && testo(k.nome)).map(k => ({
      azienda: a.codice, codice: k.codice, nome: testo(k.nome)!, ruolo: testo(k.ruolo), telefono: testo(k.telefono), altri_telefoni: testo(k.altri_telefoni),
      email: testo(k.email)?.toLowerCase() ?? null, note: testo(k.note),
    })));
    const esito = {
      aziende: righe.length, nuove: righe.filter(r => !esistenti.has(r.codice)).length,
      daVerificare: righe.filter(r => r.da_verificare && !esistenti.has(r.codice)).length,
      contatti: contatti.length, collegate, conflitti,
    };
    if (opz.anteprima) return esito;

    // un cliente entrato da solo nel CRM (senza codice) diventa l'azienda del file: restano le sue attività
    const unisci = righe.filter(r => r.cliente_id);
    if (unisci.length) await c.query(`
      UPDATE crm_aziende a SET codice = x.codice FROM jsonb_to_recordset($1) AS x(codice text, cliente_id int)
      WHERE a.cliente_id = x.cliente_id AND a.codice IS NULL`, [JSON.stringify(unisci.map(r => ({ codice: r.codice, cliente_id: r.cliente_id })))]);

    const campi = ['settore', 'descrizione', 'indirizzo', 'cap', 'citta', 'provincia', 'regione', 'paese', 'partita_iva', 'telefono', 'altri_telefoni',
      'email', 'altre_email', 'sito', 'altri_nomi', 'ateco', 'dipendenti', 'fatturato', 'note'];
    await c.query(`
      INSERT INTO crm_aziende (codice, ragione_sociale, cliente_id, stato, ${campi.join(', ')}, da_verificare)
      SELECT codice, ragione_sociale, cliente_id, stato, ${campi.join(', ')}, da_verificare
      FROM jsonb_to_recordset($1) AS x(codice text, ragione_sociale text, cliente_id int, stato text, settore text, descrizione text, indirizzo text,
        cap text, citta text, provincia text, regione text, paese text, partita_iva text, telefono text, altri_telefoni text, email text, altre_email text,
        sito text, altri_nomi text, ateco text, dipendenti int, fatturato numeric, note text, da_verificare text)
      ON CONFLICT (codice) DO UPDATE SET
        ragione_sociale = CASE WHEN crm_aziende.cliente_id IS NULL THEN EXCLUDED.ragione_sociale ELSE crm_aziende.ragione_sociale END,
        cliente_id = coalesce(crm_aziende.cliente_id, EXCLUDED.cliente_id),
        stato = CASE WHEN crm_aziende.cliente_id IS NULL AND EXCLUDED.cliente_id IS NOT NULL THEN 'cliente' ELSE crm_aziende.stato END,
        da_verificare = CASE WHEN EXCLUDED.cliente_id IS NOT NULL THEN NULL ELSE crm_aziende.da_verificare END,
        ${campi.map(k => `${k} = coalesce(crm_aziende.${k}, EXCLUDED.${k})`).join(', ')},
        aggiornato_il = now()`, [JSON.stringify(righe)]);

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
