/**
 * Stoccaggio componenti (Adriano 13/11/2026): caricamento dei file degli armadi, prezzi, proprietari e % di riconoscimento.
 * Regole in engine/armadi.ts. Niente timer: tutto si legge all'apertura della pagina (Neon).
 */
import { q, q1, transazione } from './db.js';
import { maiuscoloPulito, testoDaFile } from '../engine/componenti-clienti.js';
import { candidatiRiga } from '../engine/righe-fattura.js';
import { pnKey } from '../engine/codifica/bom.js';
import {
  candidatiPn, chiaviArticolo, clientiDelleSigle, descrizioneArticolo, gruppoDaDescrizione, gruppoStima, leggiAnagraficaArmadi, pnPulito, stimePerGruppo, leggiArchivioBobine, leggiSigla, pnDaDescrizione, prezzoOnline, quote, riepilogo,
  scegliPrezzo, senzaSuffisso, tabellaSigle, SEPARATORE_FILE, type ArticoloLetto, type BobinaLetta, type PrezzoCandidato, type Regola,
  type Riconoscimento, type ScelteSigle,
} from '../engine/armadi.js';

export interface ImpostazioniArmadi { proprietari: ScelteSigle; clientiSigle: ScelteSigle; riconoscimento: Riconoscimento; regola: Regola; caricato_il?: string; online?: { ultimo?: string; esito?: string } }

/** % di riconoscimento iniziale dei componenti dei clienti (Adriano 13/11/2026: 100 %, poi si cambia cliente per cliente nella pagina). */
export const RICONOSCIMENTO_INIZIALE = 100;

export async function impostazioniArmadi(): Promise<ImpostazioniArmadi> {
  const v = (await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'armadi'`))?.valore ?? {};
  return {
    proprietari: v.proprietari ?? {},
    clientiSigle: v.clientiSigle ?? {},
    riconoscimento: { predefinita: Number.isFinite(v.riconoscimento?.predefinita) ? v.riconoscimento.predefinita : RICONOSCIMENTO_INIZIALE, clienti: v.riconoscimento?.clienti ?? {} },
    regola: v.regola === 'articolo' ? 'articolo' : 'bobina',
    caricato_il: v.caricato_il, online: v.online,
  };
}
export async function salvaImpostazioniArmadi(cambi: Partial<ImpostazioniArmadi>) {
  const v = { ...(await impostazioniArmadi()), ...cambi };
  await q(`INSERT INTO impostazioni (chiave, valore, aggiornato_il) VALUES ('armadi', $1, now())
    ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, aggiornato_il = now()`, [JSON.stringify(v)]);
}

/** Il browser manda i due file uniti dal separatore (prima l'anagrafica, poi le bobine). */
export function dividiFile(dati: Buffer): { articoli: string; bobine: string } {
  const sep = Buffer.from(SEPARATORE_FILE, 'utf8');
  const i = dati.indexOf(sep);
  if (i < 0) throw new Error('servono tutti e due i file: ItemList_armadi.txt e reel_archive.csv');
  return { articoli: testoDaFile(dati.subarray(0, i)), bobine: testoDaFile(dati.subarray(i + sep.length)) };
}

// ── Prezzi d'acquisto ────────────────────────────────────────────────────────

/** Ultimo prezzo d'acquisto per chiave (P/N o codice senza segni): fatture dei fornitori, autofatture, ordini a fornitore, archivio componenti. */
export async function indiceAcquisti(): Promise<Map<string, PrezzoCandidato>> {
  const indice = new Map<string, PrezzoCandidato>();
  const metti = (chiavi: (string | null | undefined)[], c: PrezzoCandidato) => {
    if (!(c.prezzo > 0)) return;
    for (const x of chiavi) {
      const k = pnKey(x);
      if (!k || k.length < 4 || !/\d/.test(k)) continue;
      const prima = indice.get(k);
      if (!prima || String(c.data ?? '') > String(prima.data ?? '')) indice.set(k, c);
    }
  };
  const comp = await q<{ id: number; pn: string | null; codice_produzione: string | null; codice_gestionale: string | null; prezzo_acquisto: number | null; prezzo_data: string | null; prezzo_fornitore: string | null }>(
    `SELECT id, pn, codice_produzione, codice_gestionale, prezzo_acquisto::float AS prezzo_acquisto, to_char(prezzo_data, 'YYYY-MM-DD') AS prezzo_data, prezzo_fornitore FROM componenti`);
  const chiaviComp = new Map(comp.map(c => [c.id, [c.pn, c.codice_produzione, c.codice_gestionale]]));
  for (const c of comp) if (c.prezzo_acquisto) metti(chiaviComp.get(c.id)!, { fonte: 'acquisto', prezzo: c.prezzo_acquisto, data: c.prezzo_data, nota: `ordine a ${c.prezzo_fornitore ?? 'fornitore'}` });

  const ricevute = await q<{ codice: string | null; descrizione: string; pn: string | null; componente_id: number | null; quantita: number; imponibile: number; data: string | null; fornitore: string | null; numero: string | null }>(
    `SELECT r.codice, r.descrizione, r.pn, r.componente_id, r.quantita::float AS quantita, r.imponibile::float AS imponibile, to_char(d.data, 'YYYY-MM-DD') AS data,
       coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale') AS fornitore, d.numero
     FROM documenti_ricevuti_righe r JOIN documenti_ricevuti d ON d.id = r.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
     WHERE d.tipo <> 'nota_credito' AND r.quantita > 0 AND r.imponibile > 0 AND (r.pn IS NOT NULL OR r.componente_id IS NOT NULL OR r.codice IS NOT NULL)`);
  for (const r of ricevute) {
    metti([...candidatiRiga({ descrizione: r.descrizione ?? '', codice: r.codice, pn: r.pn }), ...(r.componente_id ? chiaviComp.get(r.componente_id) ?? [] : [])],
      { fonte: 'acquisto', prezzo: Math.round(r.imponibile / r.quantita * 10000) / 10000, data: r.data, nota: `fattura ${r.numero ?? ''} di ${r.fornitore ?? 'fornitore'}` });
  }

  const nostre = await q<{ tipo: string; codice: string | null; descrizione: string; componente_id: number | null; prezzo: number; sconto: number | null; data: string | null; fornitore: string | null; numero: string | null }>(
    `SELECT d.tipo, r.codice, r.descrizione, r.componente_id, r.prezzo::float AS prezzo, r.sconto::float AS sconto, to_char(d.data, 'YYYY-MM-DD') AS data,
       d.intestatario->>'ragione_sociale' AS fornitore, d.numero::text AS numero
     FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
     WHERE d.tipo IN ('autofattura', 'ordine_fornitore') AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND r.prezzo > 0 AND r.quantita > 0`);
  for (const r of nostre) {
    const produttore = /codice articolo produttore:\s*(\S+)/i.exec(r.descrizione ?? '')?.[1];
    metti([...candidatiRiga({ descrizione: r.descrizione ?? '', codice: r.codice, pn: produttore ?? null }), ...(r.componente_id ? chiaviComp.get(r.componente_id) ?? [] : [])],
      { fonte: 'acquisto', prezzo: Math.round(r.prezzo * (1 - (r.sconto ?? 0) / 100) * 10000) / 10000, data: r.data,
        nota: `${r.tipo === 'autofattura' ? 'autofattura' : 'ordine a fornitore'} ${r.numero ?? ''} ${r.fornitore ?? ''}`.trim() });
  }
  return indice;
}

/** Tutto quello che serve per dare un prezzo: indice degli acquisti e stime dei passivi per famiglia + case. */
export async function contestoPrezzi() {
  const acquisti = await indiceAcquisti();
  const stime = stimePerGruppo(await q<{ codice: string | null; prezzo: number | null }>(
    `SELECT codice_produzione AS codice, prezzo_acquisto::float AS prezzo FROM componenti WHERE prezzo_acquisto > 0`));
  return { acquisti, stime };
}
type ContestoPrezzi = Awaited<ReturnType<typeof contestoPrezzi>>;

/** Prezzo di un codice degli armadi: a mano > ultimo acquisto (la data più recente tra le sue chiavi) > online > armadi > stima. */
function prezzoArticolo(ctx: ContestoPrezzi, a: { codice: string; chiavi: string[]; codiceProduzione: string | null; descrizione: string | null; manuale: number | null; online: number | null; onlineNota: string | null; armadio: number | null }) {
  const acquisto = a.chiavi.map(k => ctx.acquisti.get(k)).filter((x): x is PrezzoCandidato => !!x).sort((x, y) => String(y.data ?? '').localeCompare(String(x.data ?? '')))[0];
  const gruppo = gruppoStima(a.codiceProduzione) ?? gruppoStima(a.codice) ?? gruppoDaDescrizione(a.descrizione);
  const stima = gruppo ? ctx.stime.get(gruppo) : undefined;
  return scegliPrezzo([
    a.manuale ? { fonte: 'manuale', prezzo: a.manuale } : null,
    acquisto,
    a.online ? { fonte: 'online', prezzo: a.online, nota: a.onlineNota } : null,
    a.armadio ? { fonte: 'armadio', prezzo: a.armadio } : null,
    stima ? { fonte: 'stima', prezzo: stima.prezzo, nota: `mediana di ${stima.quanti} acquisti ${gruppo}` } : null,
  ]);
}

// ── Caricamento ──────────────────────────────────────────────────────────────

interface Componente { id: number; pn: string | null; produttore: string | null; codice_produzione: string | null; codice_gestionale: string | null; descrizione: string | null; pn_key: string | null }

export interface EsitoCaricamento { anteprima: boolean; codici: number; pezzi: number; bobine: number; senzaBobine: number; conPrezzo: number; descrizioniCompletate: number; sigle: string[] }

/** Righe pronte da scrivere (descrizione completata, collegamenti, prezzo). */
async function preparaRighe(articoli: ArticoloLetto[], bobine: BobinaLetta[]) {
  const comp = await q<Componente>(`SELECT id, pn, produttore, codice_produzione, codice_gestionale, descrizione, pn_key FROM componenti`);
  const perCodice = new Map<string, Componente>();
  for (const c of comp) for (const k of [c.codice_produzione, c.codice_gestionale]) if (k) perCodice.set(k.toUpperCase(), c);
  const perPn = new Map(comp.filter(c => c.pn_key).map(c => [c.pn_key!, c]));
  const cc = await q<{ id: number; cliente_id: number; codice: string; descrizione: string | null }>(`SELECT id, cliente_id, codice, descrizione FROM componenti_clienti`);
  const ccPerCodice = new Map<string, typeof cc>();
  for (const k of cc) { const c = k.codice.toUpperCase(); ccPerCodice.set(c, [...(ccPerCodice.get(c) ?? []), k]); }
  const ctx = await contestoPrezzi();
  const vecchi = new Map((await q<{ codice: string; prezzo_manuale: number | null; prezzo_online: number | null; prezzo_online_nota: string | null; cercato_online_il: string | null }>(
    `SELECT codice, prezzo_manuale::float AS prezzo_manuale, prezzo_online::float AS prezzo_online, prezzo_online_nota, cercato_online_il FROM armadi_articoli`)).map(x => [x.codice, x]));
  const bobinePerCodice = new Map<string, BobinaLetta[]>();
  for (const b of bobine) bobinePerCodice.set(b.codice, [...(bobinePerCodice.get(b.codice) ?? []), b]);

  return articoli.map(a => {
    const bs = bobinePerCodice.get(a.codice) ?? [];
    const pnBobine = [...new Set(bs.map(b => b.pn).filter((x): x is string => !!x))];
    const componente = perCodice.get(a.codice) ?? perCodice.get(senzaSuffisso(a.codice)) ?? perPn.get(pnKey(a.codice) ?? '')
      ?? pnBobine.map(p => perPn.get(pnKey(p) ?? '')).find(Boolean) ?? null;
    // componente del cliente: stesso codice, meglio se dello stesso cliente della sigla
    const candidatiCc = ccPerCodice.get(a.codice) ?? [];
    const componenteCliente = candidatiCc[0] ?? null;
    const pnTesto = pnDaDescrizione(a.descrizione) ?? pnDaDescrizione(a.descrizioneAlt) ?? pnDaDescrizione(componenteCliente?.descrizione);
    const pn = pnPulito(componente?.pn) ?? pnBobine.map(pnPulito).find(Boolean) ?? pnTesto ?? null;
    const produttore = componente?.produttore ?? bs.find(b => b.produttore && !['MOUSER', 'ROHS', 'ARROW', 'DIGIKEY', 'FARNELL', 'TME'].includes(b.produttore))?.produttore ?? null;
    const descr = descrizioneArticolo(a, { componente, componenteCliente, pn, produttore });
    const chiavi = chiaviArticolo(a.codice, [componente?.pn, componente?.codice_produzione, componente?.codice_gestionale, ...pnBobine, pnTesto, pn]);
    const v = vecchi.get(a.codice);
    const scelto = prezzoArticolo(ctx, { codice: a.codice, chiavi, codiceProduzione: componente?.codice_produzione ?? null, descrizione: descr.testo, manuale: v?.prezzo_manuale ?? null,
      online: v?.prezzo_online ?? null, onlineNota: v?.prezzo_online_nota ?? null, armadio: a.prezzo });
    return {
      codice: a.codice, descrizione: descr.testo, descrizione_fonte: descr.fonte, proprietario_file: a.proprietario || null, quantita: a.quantita, pn, produttore,
      componente_id: componente?.id ?? null, componente_cliente_id: componenteCliente?.id ?? null, prezzo_armadio: a.prezzo,
      prezzo: scelto?.prezzo ?? null, prezzo_fonte: scelto?.fonte ?? null, prezzo_data: scelto?.data ?? null, prezzo_nota: scelto?.nota ?? null,
      prezzo_manuale: v?.prezzo_manuale ?? null, prezzo_online: v?.prezzo_online ?? null, prezzo_online_nota: v?.prezzo_online_nota ?? null, cercato_online_il: v?.cercato_online_il ?? null,
      completata: descr.fonte !== 'armadi' && !!descr.testo,
    };
  });
}

/** Caricamento dei file degli armadi: anteprima o scrittura (sostituisce tutto; prezzi a mano e online restano per codice). */
export async function caricaArmadi(testi: { articoli: string; bobine: string }, conferma: boolean): Promise<EsitoCaricamento> {
  const articoli = leggiAnagraficaArmadi(testi.articoli);
  const codici = new Set(articoli.map(a => a.codice));
  const bobine = leggiArchivioBobine(testi.bobine).filter(b => codici.has(b.codice));
  const righe = await preparaRighe(articoli, bobine);
  const conBobine = new Set(bobine.map(b => b.codice));
  const sigle = [...new Set([...articoli.map(a => leggiSigla(a.proprietario).sigla), ...bobine.map(b => leggiSigla(b.sigla).sigla)])].filter(s => s && s !== 'CASTELTECH').sort();
  const esito: EsitoCaricamento = {
    anteprima: !conferma, codici: articoli.length, pezzi: articoli.reduce((s, a) => s + a.quantita, 0), bobine: bobine.length,
    senzaBobine: articoli.filter(a => !conBobine.has(a.codice)).length, conPrezzo: righe.filter(r => r.prezzo).length,
    descrizioniCompletate: righe.filter(r => r.completata).length, sigle,
  };
  if (!conferma) return esito;
  await transazione(async c => {
    await c.query(`DELETE FROM armadi_bobine`);
    await c.query(`DELETE FROM armadi_articoli`);
    for (let i = 0; i < righe.length; i += 200) {
      const blocco = righe.slice(i, i + 200);
      await c.query(`INSERT INTO armadi_articoli (codice, descrizione, descrizione_fonte, proprietario_file, quantita, pn, produttore, componente_id, componente_cliente_id,
          prezzo_armadio, prezzo, prezzo_fonte, prezzo_data, prezzo_nota, prezzo_manuale, prezzo_online, prezzo_online_nota, cercato_online_il)
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(codice text, descrizione text, descrizione_fonte text, proprietario_file text, quantita int, pn text, produttore text,
          componente_id int, componente_cliente_id int, prezzo_armadio numeric, prezzo numeric, prezzo_fonte text, prezzo_data date, prezzo_nota text, prezzo_manuale numeric,
          prezzo_online numeric, prezzo_online_nota text, cercato_online_il timestamptz)`, [JSON.stringify(blocco)]);
    }
    for (let i = 0; i < bobine.length; i += 500) {
      await c.query(`INSERT INTO armadi_bobine (bobina, codice, quantita, formato, posizione, produttore, pn, sigla, msl, ultimo_uso, sessione)
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(bobina text, codice text, quantita int, formato text, posizione text, produttore text, pn text, sigla text, msl text, "ultimoUso" text, sessione text)
        ON CONFLICT (bobina) DO NOTHING`, [JSON.stringify(bobine.slice(i, i + 500))]);
    }
  });
  await salvaImpostazioniArmadi({ caricato_il: new Date().toISOString() });
  return esito;
}

/** Ricalcola il prezzo usato (dopo un prezzo a mano, acquisti nuovi o prezzi online) senza ricaricare i file. */
export async function ricalcolaPrezzi(): Promise<number> {
  const ctx = await contestoPrezzi();
  const art = await q<{ codice: string; descrizione: string | null; pn: string | null; prezzo_armadio: number | null; prezzo_manuale: number | null; prezzo_online: number | null; prezzo_online_nota: string | null;
    cp: string | null; cpp: string | null; cpg: string | null }>(
    `SELECT a.codice, a.descrizione, a.pn, a.prezzo_armadio::float AS prezzo_armadio, a.prezzo_manuale::float AS prezzo_manuale, a.prezzo_online::float AS prezzo_online, a.prezzo_online_nota,
       c.pn AS cp, c.codice_produzione AS cpp, c.codice_gestionale AS cpg
     FROM armadi_articoli a LEFT JOIN componenti c ON c.id = a.componente_id`);
  const pnBobine = new Map<string, string[]>();
  for (const b of await q<{ codice: string; pn: string }>(`SELECT DISTINCT codice, pn FROM armadi_bobine WHERE pn IS NOT NULL`)) pnBobine.set(b.codice, [...(pnBobine.get(b.codice) ?? []), b.pn]);
  const righe = art.map(a => {
    const s = prezzoArticolo(ctx, { codice: a.codice, chiavi: chiaviArticolo(a.codice, [a.pn, a.cp, a.cpp, a.cpg, ...(pnBobine.get(a.codice) ?? [])]), codiceProduzione: a.cpp, descrizione: a.descrizione,
      manuale: a.prezzo_manuale, online: a.prezzo_online, onlineNota: a.prezzo_online_nota, armadio: a.prezzo_armadio });
    return { codice: a.codice, prezzo: s?.prezzo ?? null, prezzo_fonte: s?.fonte ?? null, prezzo_data: s?.data ?? null, prezzo_nota: s?.nota ?? null };
  });
  for (let i = 0; i < righe.length; i += 500) {
    await q(`UPDATE armadi_articoli a SET prezzo = x.prezzo, prezzo_fonte = x.prezzo_fonte, prezzo_data = x.prezzo_data, prezzo_nota = x.prezzo_nota
      FROM jsonb_to_recordset($1::jsonb) AS x(codice text, prezzo numeric, prezzo_fonte text, prezzo_data date, prezzo_nota text) WHERE a.codice = x.codice`, [JSON.stringify(righe.slice(i, i + 500))]);
  }
  return righe.filter(r => r.prezzo).length;
}

/** Prezzo scritto a mano (vuoto = tolto). */
export async function salvaPrezzoManuale(codice: string, prezzo: number | null) {
  await q(`UPDATE armadi_articoli SET prezzo_manuale = $2 WHERE codice = $1`, [codice, prezzo]);
  await ricalcolaPrezzi();
}

/** Prezzi online trovati fuori dal portale (Claude, POST /api/claude/armadi/prezzi): { codice, prezzo, nota }. */
export async function salvaPrezziOnline(voci: { codice: string; prezzo: number; nota?: string }[]): Promise<number> {
  const valide = voci.filter(v => v?.codice && Number(v.prezzo) > 0).map(v => ({ codice: String(v.codice).toUpperCase(), prezzo: Number(v.prezzo), nota: v.nota ?? 'ricerca online' }));
  if (!valide.length) return 0;
  await q(`UPDATE armadi_articoli a SET prezzo_online = x.prezzo, prezzo_online_nota = x.nota, cercato_online_il = now()
    FROM jsonb_to_recordset($1::jsonb) AS x(codice text, prezzo numeric, nota text) WHERE a.codice = x.codice`, [JSON.stringify(valide)]);
  await ricalcolaPrezzi();
  return valide.length;
}

/**
 * Elenco dei codici di un cliente con le descrizioni (Adriano 13/11/2026: file di Selea e Idea Automazione con i P/N nelle descrizioni):
 * entra nei componenti del cliente (aggiunge e aggiorna) e completa subito gli articoli degli armadi con lo stesso codice:
 * descrizione dove manca o era solo ricavata, P/N dove manca. Resta anche ai prossimi caricamenti degli armadi.
 */
export async function caricaDescrizioniCliente(clienteId: number, componenti: { codice: string; descrizione: string | null }[]) {
  const letti = new Map<string, { codice: string; descrizione: string | null; famiglia: null; gruppo: null }>();
  for (const c of componenti) {
    const codice = String(c.codice ?? '').trim().toUpperCase(), descrizione = maiuscoloPulito(c.descrizione) || null;
    if (!codice) continue;
    const prima = letti.get(codice);   // codice ripetuto: vale la descrizione più lunga (di solito quella con più P/N)
    if (!prima || (descrizione?.length ?? 0) > (prima.descrizione?.length ?? 0)) letti.set(codice, { codice, descrizione, famiglia: null, gruppo: null });
  }
  const { caricaComponentiCliente } = await import('./componenti-clienti-servizio.js');
  const esito = await caricaComponentiCliente(clienteId, [...letti.values()], true);
  const aggiornati = await q<{ codice: string }>(`UPDATE armadi_articoli a SET componente_cliente_id = cc.id,
      descrizione = CASE WHEN a.descrizione IS NULL OR coalesce(a.descrizione_fonte, '') <> 'armadi' THEN cc.descrizione ELSE a.descrizione END,
      descrizione_fonte = CASE WHEN a.descrizione IS NULL OR coalesce(a.descrizione_fonte, '') <> 'armadi' THEN 'componenti del cliente' ELSE a.descrizione_fonte END,
      cercato_online_il = NULL
    FROM componenti_clienti cc WHERE cc.cliente_id = $1 AND upper(cc.codice) = upper(a.codice) AND cc.descrizione IS NOT NULL RETURNING a.codice`, [clienteId]);
  // P/N dove manca, dalla descrizione appena arrivata
  const senzaPn = await q<{ codice: string; descrizione: string }>(`SELECT codice, descrizione FROM armadi_articoli WHERE pn IS NULL AND descrizione IS NOT NULL AND codice = ANY($1)`,
    [aggiornati.map(x => x.codice)]);
  const pn = senzaPn.map(x => ({ codice: x.codice, pn: pnDaDescrizione(x.descrizione) })).filter(x => x.pn);
  if (pn.length) await q(`UPDATE armadi_articoli a SET pn = x.pn FROM jsonb_to_recordset($1::jsonb) AS x(codice text, pn text) WHERE a.codice = x.codice`, [JSON.stringify(pn)]);
  return { ...esito, articoliAggiornati: aggiornati.length, pnTrovati: pn.length };
}

// ── Ricerca dei prezzi presso i distributori ────────────────────────────────

let ricercaInCorso: { iniziata: string; fatti: number; totale: number } | null = null;
export const statoRicercaOnline = () => ricercaInCorso;

/** Codici senza prezzo d'acquisto (o a mano) con un P/N, mai cercati negli ultimi 30 giorni: prima quelli di Casteltech. */
export async function codiciDaCercare(max: number, soloCasteltech: boolean) {
  const imp = await impostazioniArmadi();
  const righe = await q<{ codice: string; pn: string | null; descrizione: string | null; descrizione_cliente: string | null; quantita: number; proprietario_file: string | null; sigle: string[] }>(
    `SELECT a.codice, a.pn, a.descrizione, cc.descrizione AS descrizione_cliente, a.quantita, a.proprietario_file,
       coalesce(array_agg(DISTINCT b.sigla) FILTER (WHERE b.sigla IS NOT NULL), '{}') AS sigle
     FROM armadi_articoli a LEFT JOIN armadi_bobine b ON b.codice = a.codice LEFT JOIN componenti_clienti cc ON cc.id = a.componente_cliente_id
     WHERE coalesce(a.prezzo_fonte, '') NOT IN ('manuale', 'acquisto')
       AND (a.cercato_online_il IS NULL OR a.cercato_online_il < now() - interval '30 days')
     GROUP BY a.codice, cc.descrizione`);
  const diCasteltech = (r: typeof righe[number]) => [r.proprietario_file, ...r.sigle].some(s => {
    const l = leggiSigla(s); return l.casteltech || imp.proprietari[l.sigla] === 'casteltech';
  });
  // P/N da provare: quello salvato (ripulito) e quelli scritti nelle descrizioni (Adriano 13/11/2026, codici Selea e Idea)
  const ordinate = righe.map(r => ({ ...r, cast: diCasteltech(r), candidati: candidatiPn(r.pn, [r.descrizione, r.descrizione_cliente]) }))
    .filter(r => r.candidati.length && (!soloCasteltech || r.cast)).sort((a, b) => Number(b.cast) - Number(a.cast));
  return ordinate.slice(0, max);
}

/** Cerca i prezzi presso i distributori collegati (in sottofondo; usa i prezzi già letti anche se vecchi). */
export async function cercaPrezziOnline(max = 300, soloCasteltech = false): Promise<string> {
  if (ricercaInCorso) return 'Una ricerca è già in corso.';
  const lista = await codiciDaCercare(max, soloCasteltech);
  if (!lista.length) return 'Non ci sono codici da cercare: hanno tutti un prezzo d\'acquisto o sono stati cercati negli ultimi 30 giorni.';
  ricercaInCorso = { iniziata: new Date().toISOString(), fatti: 0, totale: lista.length };
  setImmediate(async () => {
    let trovati = 0, errori = '';
    try {
      const { cercaPn } = await import('./fornitori.js');
      for (let i = 0; i < lista.length; i += 20) {
        const blocco = lista.slice(i, i + 20);
        const esito = await cercaPn([...new Set(blocco.flatMap(x => x.candidati))], { cacheLunga: true });
        errori = Object.entries(esito.errori).map(([f, e]) => `${f}: ${e}`).join('; ');
        const voci = blocco.map(x => {
          // il primo P/N che ha un prezzo; se non è quello salvato, diventa il P/N del codice
          for (const pn of x.candidati) {
            const r = esito.perPn.get(pnKey(pn) ?? '') ?? {};
            const p = prezzoOnline(Object.values(r).flatMap(v => v?.offerte ?? []), x.quantita);
            if (p) return { codice: x.codice, prezzo: p.prezzo, nota: pn === x.pn ? p.nota : `${p.nota} (P/N ${pn})`, pn };
          }
          return { codice: x.codice, prezzo: null, nota: null, pn: null };
        });
        trovati += voci.filter(v => v.prezzo).length;
        await q(`UPDATE armadi_articoli a SET prezzo_online = coalesce(x.prezzo, a.prezzo_online), prezzo_online_nota = coalesce(x.nota, a.prezzo_online_nota),
            pn = coalesce(x.pn, a.pn), cercato_online_il = now()
          FROM jsonb_to_recordset($1::jsonb) AS x(codice text, prezzo numeric, nota text, pn text) WHERE a.codice = x.codice`, [JSON.stringify(voci)]);
        ricercaInCorso!.fatti = Math.min(lista.length, i + 20);
      }
      await ricalcolaPrezzi();
      await salvaImpostazioniArmadi({ online: { ultimo: new Date().toISOString(), esito: `${trovati} prezzi trovati su ${lista.length} codici cercati${errori ? ` (${errori})` : ''}` } });
    } catch (e: any) {
      await salvaImpostazioniArmadi({ online: { ultimo: new Date().toISOString(), esito: `ricerca interrotta: ${e?.message ?? e}` } }).catch(() => {});
    } finally { ricercaInCorso = null; }
  });
  return `Ricerca dei prezzi avviata per ${lista.length} codici: ci vuole qualche minuto, poi ricarica la pagina.`;
}

// ── Letture per la pagina ────────────────────────────────────────────────────

export interface ArticoloArmadio {
  codice: string; descrizione: string | null; descrizione_fonte: string | null; proprietario_file: string | null; quantita: number; pn: string | null; produttore: string | null;
  componente_id: number | null; prezzo: number | null; prezzo_fonte: string | null; prezzo_data: string | null; prezzo_nota: string | null; prezzo_manuale: number | null;
  prezzo_armadio: number | null; bobine: number;
}
export const articoliArmadi = () => q<ArticoloArmadio>(`SELECT a.codice, a.descrizione, a.descrizione_fonte, a.proprietario_file, a.quantita, a.pn, a.produttore, a.componente_id,
    a.prezzo::float AS prezzo, a.prezzo_fonte, to_char(a.prezzo_data, 'DD/MM/YYYY') AS prezzo_data, a.prezzo_nota, a.prezzo_manuale::float AS prezzo_manuale,
    a.prezzo_armadio::float AS prezzo_armadio, (SELECT count(*)::int FROM armadi_bobine b WHERE b.codice = a.codice) AS bobine
  FROM armadi_articoli a ORDER BY a.codice`);
export const bobineArmadi = () => q<{ bobina: string; codice: string; quantita: number; formato: string | null; posizione: string | null; produttore: string | null; pn: string | null; sigla: string; msl: string | null; ultimo_uso: string | null }>(
  `SELECT bobina, codice, quantita, formato, posizione, produttore, pn, coalesce(sigla, '') AS sigla, msl, ultimo_uso FROM armadi_bobine ORDER BY codice, bobina`);
export const bobineDelCodice = (codice: string) => q(`SELECT * FROM armadi_bobine WHERE codice = $1 ORDER BY bobina`, [codice]);
export const articoloArmadio = (codice: string) => q1<ArticoloArmadio>(`SELECT a.*, a.prezzo::float AS prezzo, a.prezzo_manuale::float AS prezzo_manuale, a.prezzo_armadio::float AS prezzo_armadio,
    a.prezzo_online::float AS prezzo_online, to_char(a.prezzo_data, 'DD/MM/YYYY') AS prezzo_data, 0 AS bobine FROM armadi_articoli a WHERE a.codice = $1`, [codice]);

/** Tutto quello che serve alla pagina: articoli, bobine, tabella delle sigle, quote per proprietario, riepilogo. */
export async function datiArmadi() {
  const [imp, articoli, bobine, clienti] = await Promise.all([impostazioniArmadi(), articoliArmadi(), bobineArmadi(),
    q<{ id: number; ragione_sociale: string }>(`SELECT id, ragione_sociale FROM clienti ORDER BY ragione_sociale`)]);
  const sigle = [...new Set([...articoli.map(a => leggiSigla(a.proprietario_file).sigla), ...bobine.map(b => leggiSigla(b.sigla).sigla)])].filter(s => s && s !== 'CASTELTECH').sort();
  const tabella = tabellaSigle(sigle, clienti, imp.proprietari);
  const clientiSigle = clientiDelleSigle(sigle, clienti, tabella, imp.clientiSigle);
  const qq = quote(articoli, bobine, tabella, imp.regola);
  return { imp, articoli, bobine, clienti, sigle, tabella, clientiSigle, quote: qq, riepilogo: riepilogo(qq, imp.riconoscimento) };
}
