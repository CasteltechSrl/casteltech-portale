/**
 * Acquisizione di ordini e aggiornamenti: i file arrivano dalla cartella Google Drive o si caricano dal portale
 * (Ordini → Da acquisire). Gli ordini (PDF, foto, email) li legge l'IA e diventano una proposta "da confermare":
 * l'ordine nasce solo quando l'ufficio conferma. Il cliente si sceglie SOLO dall'anagrafica.
 */
import { createHash } from 'node:crypto';
import { pool, q, q1, transazione } from './db.js';
import { maiuscolo, risolvi } from './anagrafiche-servizio.js';
import { leggiFatturaEsteraConIa, leggiFogliTempiConIa, leggiOrdineConIa, type Parte } from './lettura-ordini-ia.js';
import { collegaFatturaEstera } from './autofatture-servizio.js';
import { fasiCommessa, leggiCommessa } from './commesse-servizio.js';
import { righeDaFoglio, type RigaScansione } from '../engine/fogli-tempi.js';
import { dividiDdt, type DdtLetto, type RigaAperta, type RigaDdtLetta } from '../engine/acquisizioni.js';
import { righeOrdini } from './ordini-servizio.js';
import { leggiEmail, mimeDaNome, numeroOrdineEmail, PRIMO_NUMERO_EMAIL, tipoFile, tipoRigaDa, type Proposta, type RigaProposta } from '../engine/acquisizioni.js';

export interface RigaPropostaDb extends RigaProposta { prodottoId: number | null; tipo: 'scheda' | 'servizio' }
/** Quello che si salva in acquisizioni.proposta: la lettura dell'IA più i collegamenti all'anagrafica. */
export interface PropostaDb extends Omit<Proposta, 'righe'> { clienteId: number | null; righe: RigaPropostaDb[]; mittente?: string; oggetto?: string }

const DA_LEGGERE = ['ordine', 'email', 'scheda_produzione', 'ddt', 'fattura_estera'];

/**
 * Registra un file arrivato. Lo stesso file di Drive non entra due volte; lo stesso contenuto arrivato di nuovo
 * (es. messo due volte nella cartella) si registra già scartato, con il rimando al primo, e non si rilegge.
 */
export async function aggiungiFile(nome: string, dati: Buffer, opz: { origine?: 'drive' | 'caricato'; driveId?: string } = {}): Promise<{ id: number | null; doppioneDi?: number }> {
  const tipo = tipoFile(nome);
  const impronta = createHash('sha256').update(dati).digest('hex');
  const primo = await q1<{ id: number; creato_il: Date }>(`SELECT id, creato_il FROM acquisizioni WHERE impronta = $1 AND stato <> 'scartato' ORDER BY id LIMIT 1`, [impronta]);
  const r = await q1<{ id: number }>(`INSERT INTO acquisizioni (origine, drive_id, nome_file, tipo, mime, contenuto, impronta, stato, errore) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (drive_id) DO NOTHING RETURNING id`, [opz.origine ?? 'caricato', opz.driveId ?? null, nome.slice(0, 250), tipo, mimeDaNome(nome),
    primo ? null : dati, impronta, primo ? 'scartato' : 'nuovo',
    primo ? `stesso file già arrivato il ${new Date(primo.creato_il).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })}` : null]);
  return primo ? { id: null, doppioneDi: primo.id } : { id: r?.id ?? null };
}

/** Il file diviso in pezzi da mandare all'IA (per le email: testo e allegati PDF/immagini). */
function partiDa(nome: string, tipo: string, mime: string, dati: Buffer): { parti: Parte[]; mittente?: string; oggetto?: string } {
  // anche la fattura estera mandata dal pulsante di Gmail arriva come email intera (.eml)
  if (tipo === 'email' || /\.eml$/i.test(nome)) {
    const e = leggiEmail(dati);
    const parti: Parte[] = [];
    if (e.testo) parti.push({ tipo: 'testo', nome: `Email da ${e.mittente}, oggetto "${e.oggetto}", del ${e.data}`, testo: e.testo });
    for (const a of e.allegati) {
      const m = a.mime === 'application/octet-stream' ? mimeDaNome(a.nome) : a.mime;
      if (m === 'application/pdf') parti.push({ tipo: 'pdf', mime: m, dati: a.dati, nome: a.nome });
      else if (/^image\/(png|jpeg|webp|gif)$/.test(m)) parti.push({ tipo: 'immagine', mime: m, dati: a.dati, nome: a.nome });
    }
    return { parti, mittente: e.mittente, oggetto: e.oggetto };
  }
  if (mime === 'application/pdf') return { parti: [{ tipo: 'pdf', mime, dati, nome }] };
  if (mime.startsWith('image/')) return { parti: [{ tipo: 'immagine', mime, dati, nome }] };
  return { parti: [{ tipo: 'testo', nome, testo: dati.toString('utf8') }] };
}

/** Collega cliente e prodotti della proposta all'anagrafica (non aggiunge niente). */
async function collega(p: Proposta | PropostaDb, clienteScelto?: number | null): Promise<PropostaDb> {
  let clienteId: number | null = null;
  if (clienteScelto) clienteId = (await q1<{ id: number }>(`SELECT id FROM clienti WHERE id = $1`, [clienteScelto]))?.id ?? null;
  else if (p.cliente) clienteId = (await risolvi(pool, p.cliente, '')).clienteId;
  const nomeCliente = clienteId ? (await q1<{ r: string }>(`SELECT ragione_sociale AS r FROM clienti WHERE id = $1`, [clienteId]))!.r : p.cliente;
  const righe: RigaPropostaDb[] = [];
  for (const r of p.righe) {
    const x = r as Partial<RigaPropostaDb>;
    let prodottoId = x.prodottoId ?? null;
    // il prodotto scelto deve essere del cliente (o senza cliente); altrimenti si cerca dal codice letto
    if (prodottoId && !(await q1(`SELECT 1 FROM prodotti WHERE id = $1 AND (cliente_id = $2 OR cliente_id IS NULL)`, [prodottoId, clienteId ?? -1]))) prodottoId = null;
    if (!prodottoId && x.prodottoId === undefined && r.codice && clienteId) prodottoId = (await risolvi(pool, nomeCliente, r.codice)).prodottoId;
    righe.push({ ...r, prodottoId, tipo: x.tipo ?? (prodottoId ? 'scheda' : tipoRigaDa(`${r.codice} ${r.descrizione}`)) });
  }
  return { ...p, clienteId, cliente: maiuscolo(nomeCliente), righe };
}

/** Legge un ordine con l'IA e lo mette "da confermare". Gli export di Fatture in Cloud restano in attesa. */
export async function elabora(id: number): Promise<void> {
  const a = await q1(`SELECT id, nome_file, tipo, mime, contenuto FROM acquisizioni WHERE id = $1`, [id]);
  if (!a || !DA_LEGGERE.includes(a.tipo) || !a.contenuto) return;
  try {
    const { parti, mittente, oggetto } = partiDa(a.nome_file, a.tipo, a.mime ?? '', a.contenuto);
    if (!parti.length) throw new Error("nell'email non ci sono testo né allegati PDF o immagini");
    // fattura di un fornitore estero: caricata da Amministrazione → Autofatture (già si sa cos'è) o riconosciuta alla prima lettura
    const fattura = async () => {
      const f = await collegaFatturaEstera(await leggiFatturaEsteraConIa(parti));
      await q(`UPDATE acquisizioni SET tipo = 'fattura_estera', stato = 'da_confermare', proposta = $2, errore = NULL, elaborato_il = now() WHERE id = $1`,
        [id, JSON.stringify(f)]);
    };
    if (a.tipo === 'fattura_estera') return await fattura();
    const clienti = (await q<{ r: string }>(`SELECT ragione_sociale AS r FROM clienti ORDER BY ragione_sociale`)).map(c => c.r);
    const lettura = await leggiOrdineConIa(parti, clienti);
    if (lettura.tipo === 'fattura_estera') return await fattura();
    if (lettura.tipo === 'ddt') {
      const ddt = await collegaDdt({ tipoDocumento: 'ddt', ...lettura.ddt, clienteId: null, righe: lettura.ddt.righe });
      await q(`UPDATE acquisizioni SET tipo = 'ddt', stato = 'da_confermare', proposta = $2, errore = NULL, elaborato_il = now() WHERE id = $1`,
        [id, JSON.stringify(ddt)]);
      return;
    }
    if (lettura.tipo === 'scheda_produzione') {
      const scheda = await leggiScheda(parti, lettura.commesse, oggiRoma());
      await q(`UPDATE acquisizioni SET tipo = 'scheda_produzione', stato = 'da_confermare', proposta = $2, errore = NULL, elaborato_il = now() WHERE id = $1`,
        [id, JSON.stringify(scheda)]);
      return;
    }
    const proposta = await collega(lettura.proposta);
    if (mittente) proposta.mittente = mittente;
    if (oggetto) proposta.oggetto = oggetto;
    await q(`UPDATE acquisizioni SET stato = 'da_confermare', proposta = $2, errore = NULL, elaborato_il = now() WHERE id = $1`, [id, JSON.stringify(proposta)]);
  } catch (e: any) {
    await q(`UPDATE acquisizioni SET stato = 'errore', errore = $2, elaborato_il = now() WHERE id = $1`, [id, String(e?.message ?? e).slice(0, 500)]);
  }
}

// ───────────────────────────── schede di produzione scansionate ─────────────────────────────
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** Righe lette per ciascuna commessa: si propongono nel rientro (fatto = l'ufficio le ha salvate). */
export interface CommessaLetta { numero: string; commessaId: number | null; righe: RigaScansione[]; fatto?: boolean }
export interface SchedaLetta { tipoDocumento: 'scheda_produzione'; commesse: CommessaLetta[] }

/** Seconda lettura: i fogli tempi, con le fasi delle commesse per aiutare l'IA e per trovare la fase dal numero. */
async function leggiScheda(parti: Parte[], numeri: string[], oggi: string): Promise<SchedaLetta> {
  const trovate = new Map<string, { id: number; fasi: Map<string, string>; testo: string }>();
  for (const n of numeri) {
    const c = await q1<{ id: number }>(`SELECT id FROM commesse WHERE upper(replace(numero, ' ', '')) = $1`, [n]);
    if (!c) continue;
    const fasi = await fasiCommessa(await leggiCommessa(c.id));
    trovate.set(n, { id: c.id, fasi: new Map(fasi.map(f => [String(f.numero).toUpperCase(), f.codice])), testo: fasi.map(f => `${f.numero} ${f.nome}`).join('; ') });
  }
  // fasi non previste sulla scheda ma scritte lo stesso: si cercano nel catalogo con la numerazione attuale
  const catalogo = new Map((await q<{ codice: string; numero: string }>(`SELECT codice, numero FROM fasi WHERE numero IS NOT NULL`)).map(f => [String(f.numero).toUpperCase(), f.codice]));
  const fogli = await leggiFogliTempiConIa(parti, [...trovate.entries()].map(([n, t]) => `commessa ${n}: ${t.testo}`).join(' | '));
  const perCommessa = new Map<string, typeof fogli>();
  for (const f of fogli) {
    const n = String(f.commessa ?? numeri[0] ?? '').toUpperCase().replace(/\s+/g, '');
    perCommessa.set(n, [...(perCommessa.get(n) ?? []), f]);
  }
  const commesse: CommessaLetta[] = [];
  for (const [n, fs] of perCommessa) {
    const t = trovate.get(n) ?? (await (async () => {
      const c = await q1<{ id: number }>(`SELECT id FROM commesse WHERE upper(replace(numero, ' ', '')) = $1`, [n]);
      return c ? { id: c.id, fasi: new Map((await fasiCommessa(await leggiCommessa(c.id))).map(f => [String(f.numero).toUpperCase(), f.codice])), testo: '' } : undefined;
    })());
    const mappa = new Map([...catalogo, ...(t?.fasi ?? [])]);
    commesse.push({ numero: n, commessaId: t?.id ?? null, righe: righeDaFoglio(fs, mappa, oggi) });
  }
  return { tipoDocumento: 'scheda_produzione', commesse };
}

/** Il rientro della commessa è stato salvato con le righe lette: quando tutte le commesse sono fatte l'acquisizione è confermata. */
export async function segnaRientroFatto(acquisizioneId: number, commessaId: number, utenteId: number): Promise<void> {
  const a = await q1(`SELECT proposta FROM acquisizioni WHERE id = $1 AND tipo = 'scheda_produzione'`, [acquisizioneId]);
  if (!a?.proposta?.commesse) return;
  const p = a.proposta as SchedaLetta;
  for (const c of p.commesse) if (c.commessaId === commessaId) c.fatto = true;
  const tutte = p.commesse.every(c => c.fatto || !c.commessaId);
  await q(`UPDATE acquisizioni SET proposta = $2, stato = CASE WHEN $3 THEN 'confermato' ELSE stato END,
      confermato_da = CASE WHEN $3 THEN $4::int ELSE confermato_da END WHERE id = $1`, [acquisizioneId, JSON.stringify(p), tutte, utenteId]);
}

/** Salva le correzioni dell'ufficio alla proposta (senza creare l'ordine) e ricollega i prodotti al cliente scelto. */
export async function salvaProposta(id: number, p: PropostaDb): Promise<PropostaDb> {
  const nuova = await collega(p, p.clienteId);
  await q(`UPDATE acquisizioni SET proposta = $2 WHERE id = $1 AND stato IN ('da_confermare', 'errore')`, [id, JSON.stringify(nuova)]);
  return nuova;
}

/**
 * Conferma: nasce l'ordine (origine email, numero dal 9001 nell'anno, data di oggi) con le righe controllate dall'ufficio.
 * Il cliente deve essere in anagrafica; i prodotti non in anagrafica restano con il codice del cliente (come nell'import).
 */
export async function conferma(id: number, p: PropostaDb, utenteId: number, oggi: string): Promise<number> {
  const pr = await collega(p, p.clienteId);
  if (!pr.clienteId) throw new Error("scegli il cliente dall'anagrafica");
  const righe = pr.righe.filter(r => r.quantita > 0 && (r.codice || r.descrizione || r.prodottoId));
  if (!righe.length) throw new Error('serve almeno una riga con la quantità');
  return transazione(async c => {
    const a = (await c.query(`SELECT id, nome_file, stato FROM acquisizioni WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!a) throw new Error('acquisizione non trovata');
    if (a.stato === 'confermato') throw new Error("l'ordine è già stato creato");
    const anno = Number(oggi.slice(0, 4));
    const massimo = (await c.query(`SELECT max(numero) AS m FROM ordini WHERE anno = $1 AND numero >= $2`, [anno, PRIMO_NUMERO_EMAIL])).rows[0].m;
    const { id: ordineId } = (await c.query(`INSERT INTO ordini (anno, numero, data_ordine, cliente_id, cliente_nome, rif_cliente, data_ordine_cliente, origine, file, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'email',$8,$9) RETURNING id`,
      [anno, numeroOrdineEmail(massimo), oggi, pr.clienteId, pr.cliente, pr.rifCliente || null, pr.dataOrdine, a.nome_file, pr.note || null])).rows[0];
    for (const [i, r] of righe.entries()) {
      const prodotto = r.prodottoId ? (await c.query(`SELECT codice, descrizione FROM prodotti WHERE id = $1`, [r.prodottoId])).rows[0] : null;
      await c.query(`INSERT INTO ordini_righe (ordine_id, chiave, posizione, prodotto_id, codice, descrizione, codice_cliente, descrizione_cliente, tipo, quantita, prezzo, consegna_richiesta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [ordineId, `A${id}-${i + 1}`, i, r.prodottoId, prodotto?.codice ?? (r.codice || null), prodotto?.descrizione || r.descrizione || null,
          r.codice || null, r.descrizione || null, r.tipo, r.quantita, r.prezzo ?? 0, r.consegna]);
    }
    await c.query(`UPDATE acquisizioni SET stato = 'confermato', ordine_id = $2, confermato_da = $3, proposta = $4 WHERE id = $1`,
      [id, ordineId, utenteId, JSON.stringify(pr)]);
    return ordineId;
  });
}

/** Scartato (non è un ordine, doppione…): il file si svuota, resta la riga per non rileggerlo da Drive. */
export async function scarta(id: number): Promise<void> {
  await q(`UPDATE acquisizioni SET stato = 'scartato', contenuto = NULL WHERE id = $1 AND stato <> 'confermato'`, [id]);
}

// ───────────────────────────── DDT di Casteltech in PDF ─────────────────────────────
export interface RigaDdtDb extends RigaDdtLetta { rigaId?: number | null }
export interface DdtDb extends Omit<DdtLetto, 'righe'> { tipoDocumento: 'ddt'; clienteId: number | null; righe: RigaDdtDb[] }

/** Righe d'ordine del cliente ancora da spedire (schede da evadere o parziali), per l'abbinamento. */
export async function righeAperteCliente(clienteId: number | null) {
  if (!clienteId) return [];
  return (await righeOrdini()).filter(r => r.clienteId === clienteId && r.tipo === 'scheda' && ['da_evadere', 'parziale'].includes(r.stato));
}

/**
 * Collega il DDT all'anagrafica (cliente scelto o letto) e propone per ogni riga la riga d'ordine aperta.
 * Una riga già abbinata dall'ufficio (rigaId numero) resta; undefined = da proporre, null = nessun ordine.
 */
export async function collegaDdt(d: DdtDb): Promise<DdtDb> {
  let clienteId = d.clienteId ? (await q1<{ id: number }>(`SELECT id FROM clienti WHERE id = $1`, [d.clienteId]))?.id ?? null : null;
  if (!clienteId && d.cliente) clienteId = (await risolvi(pool, d.cliente, '')).clienteId;
  const cliente = clienteId ? (await q1<{ r: string }>(`SELECT ragione_sociale AS r FROM clienti WHERE id = $1`, [clienteId]))!.r : d.cliente;
  const aperte = await righeAperteCliente(clienteId);
  const candidate: RigaAperta[] = aperte.map(a => ({ id: a.id, codice: a.codice, codiceCliente: a.codiceCliente, descrizione: a.descrizione,
    rifCliente: a.rifCliente, residuo: a.residuoQuantita, consegna: a.consegna }));
  const valide = new Set(aperte.map(a => a.id));
  // righe da proporre (mai abbinate o abbinate a una riga non più aperta): quantità oltre la riga d'ordine divisa tra le righe a breve
  const daProporre = d.righe.map(r => (r.rigaId === undefined || (r.rigaId && !valide.has(r.rigaId)) ? { ...r, rigaId: undefined } : r));
  const righe = dividiDdt(daProporre, candidate, d.rifOrdine, d.data);
  return { ...d, clienteId, cliente: maiuscolo(cliente), righe };
}

export async function salvaDdt(id: number, d: DdtDb): Promise<DdtDb> {
  const nuovo = await collegaDdt(d);
  await q(`UPDATE acquisizioni SET proposta = $2 WHERE id = $1 AND tipo = 'ddt' AND stato IN ('da_confermare', 'errore')`, [id, JSON.stringify(nuovo)]);
  return nuovo;
}

/** Conferma: le righe del DDT entrano nei DDT del portale collegate alle righe d'ordine (lo spedito e lo stato si aggiornano). */
export async function confermaDdt(id: number, d: DdtDb, utenteId: number): Promise<void> {
  const ddt = await collegaDdt(d);
  if (!ddt.clienteId) throw new Error("scegli il cliente dall'anagrafica");
  if (!ddt.numero || !ddt.data) throw new Error('mancano numero o data del DDT');
  const righe = ddt.righe.filter(r => r.quantita > 0);
  if (!righe.length) throw new Error('nessuna riga con quantità');
  const anno = Number(ddt.data.slice(0, 4));
  await transazione(async c => {
    const a = (await c.query(`SELECT stato FROM acquisizioni WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!a || a.stato === 'confermato') throw new Error('DDT già confermato');
    if ((await c.query(`SELECT 1 FROM ddt_righe WHERE anno = $1 AND numero = $2 LIMIT 1`, [anno, ddt.numero])).rowCount)
      throw new Error(`il DDT ${ddt.numero}/${anno} è già nel portale`);
    for (const r of righe)
      await c.query(`INSERT INTO ddt_righe (anno, numero, data, cliente_id, cliente_nome, codice, descrizione, quantita, imponibile, riga_id, origine, acquisizione_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,'acquisito',$10)`,
        [anno, ddt.numero, ddt.data, ddt.clienteId, ddt.cliente, r.codice || null, r.descrizione || null, r.quantita, r.rigaId ?? null, id]);
    await c.query(`UPDATE acquisizioni SET stato = 'confermato', confermato_da = $2, proposta = $3 WHERE id = $1`, [id, utenteId, JSON.stringify(ddt)]);
  });
}
