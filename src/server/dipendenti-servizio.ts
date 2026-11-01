/**
 * Sezione Dipendenti: documenti dello studio paghe (dalla cartella Drive "Da acquisire" o caricati), costo del personale,
 * storico dall'archivio, nota spese. Regole e conti in `engine/dipendenti.ts`.
 */
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { q, q1, transazione } from './db.js';
import { leggiF24ConIa, leggiNotaContabileConIa } from './lettura-paghe-ia.js';
import { periodoDaNome, righeCostiValide, tipoDocumentoPaghe, type CostoQualifica, type TipoPaghe } from '../engine/dipendenti.js';

export { tipoDocumentoPaghe };

/**
 * Registra un documento delle paghe. Lo stesso file (stessa impronta o stesso file di Drive) non entra due volte.
 * Mese e anno dal nome; la nota contabile e l'F24 li legge poi l'IA (`leggiDocumentoPaghe`).
 */
export async function registraDocumentoPaghe(nome: string, dati: Buffer, opz: { tipo?: TipoPaghe; origine?: 'drive' | 'caricato'; driveId?: string; utenteId?: number } = {})
  : Promise<{ id: number | null; tipo: TipoPaghe | null; doppione?: boolean }> {
  const tipo = opz.tipo ?? tipoDocumentoPaghe(nome);
  if (!tipo) return { id: null, tipo: null };
  const impronta = createHash('sha256').update(dati).digest('hex');
  const gia = await q1<{ id: number }>(`SELECT id FROM paghe_documenti WHERE impronta = $1 OR (drive_id IS NOT NULL AND drive_id = $2)`, [impronta, opz.driveId ?? '']);
  if (gia) return { id: gia.id, tipo, doppione: true };
  const p = periodoDaNome(nome, tipo);
  const r = await q1<{ id: number }>(`INSERT INTO paghe_documenti (tipo, anno, mese, scadenza, nome_file, contenuto, impronta, origine, drive_id, caricato_da)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [tipo, p?.anno ?? null, p?.mese ?? null, p?.scadenza ?? null, nome.slice(0, 250), dati, impronta, opz.origine ?? 'caricato', opz.driveId ?? null, opz.utenteId ?? null]);
  return { id: r!.id, tipo };
}

/** Salva i costi di un mese (una riga per qualifica). Le righe scritte a mano dall'ufficio non si toccano. */
export async function salvaCostiMese(anno: number, mese: number, qualifiche: CostoQualifica[], origine: 'archivio' | 'nota_contabile' | 'manuale',
  opz: { documentoId?: number | null; file?: string | null } = {}): Promise<number> {
  return transazione(async c => {
    const manuali = (await c.query(`SELECT 1 FROM costi_personale WHERE anno = $1 AND mese = $2 AND origine = 'manuale' LIMIT 1`, [anno, mese])).rowCount;
    if (manuali && origine !== 'manuale') return 0;
    // le qualifiche del mese le dice la nota più recente: quelle che non ci sono più si tolgono
    await c.query(`DELETE FROM costi_personale WHERE anno = $1 AND mese = $2`, [anno, mese]);
    for (const x of qualifiche)
      await c.query(`INSERT INTO costi_personale (anno, mese, qualifica, lordo, contributi, tfr, altri, netto, origine, documento_id, file)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [anno, mese, x.qualifica, x.lordo, x.contributi, x.tfr, x.altri, x.netto, origine, opz.documentoId ?? null, opz.file ?? null]);
    return qualifiche.length;
  });
}

/** Legge con l'IA la nota contabile (costi del mese) o l'F24 (scadenza e totale). Cedolini e riepiloghi non si leggono. */
export async function leggiDocumentoPaghe(id: number): Promise<void> {
  const d = await q1(`SELECT id, tipo, nome_file, contenuto FROM paghe_documenti WHERE id = $1`, [id]);
  if (!d?.contenuto || !['nota_contabile', 'f24'].includes(d.tipo)) return;
  try {
    if (d.tipo === 'nota_contabile') {
      const n = await leggiNotaContabileConIa(d.contenuto, d.nome_file);
      if (n === 'non_nota') throw new Error('non sembra una nota contabile delle paghe: se è un ordine o una nota di credito, caricalo in Ordini → Da acquisire');
      await salvaCostiMese(n.anno, n.mese, n.qualifiche, 'nota_contabile', { documentoId: id, file: d.nome_file });
      await q(`UPDATE paghe_documenti SET stato = 'letto', anno = $2, mese = $3, lettura = $4, errore = NULL WHERE id = $1`, [id, n.anno, n.mese, JSON.stringify(n)]);
    } else {
      const f = await leggiF24ConIa(d.contenuto, d.nome_file);
      if (f === 'non_f24') throw new Error('non sembra un modello F24');
      await q(`UPDATE paghe_documenti SET stato = 'letto', scadenza = coalesce($2::date, scadenza), totale = $3, lettura = $4, errore = NULL WHERE id = $1`,
        [id, f.scadenza, f.totale || null, JSON.stringify(f)]);
    }
  } catch (e: any) {
    await q(`UPDATE paghe_documenti SET stato = 'errore', errore = $2 WHERE id = $1`, [id, String(e?.message ?? e).slice(0, 500)]);
  }
}

/** Storico dei costi dall'archivio (file costi_personale.json.gz preparato fuori dal repository): anteprima, poi conferma. */
export async function caricaStoricoCosti(x: unknown, opz: { anteprima: boolean }) {
  const righe = righeCostiValide(x);
  const mesi = new Map<string, typeof righe>();
  for (const r of righe) mesi.set(`${r.anno}-${r.mese}`, [...(mesi.get(`${r.anno}-${r.mese}`) ?? []), r]);
  const manuali = new Set((await q<{ k: string }>(`SELECT DISTINCT anno || '-' || mese AS k FROM costi_personale WHERE origine = 'manuale'`)).map(r => r.k));
  const daNote = new Set((await q<{ k: string }>(`SELECT DISTINCT anno || '-' || mese AS k FROM costi_personale WHERE origine = 'nota_contabile'`)).map(r => r.k));
  // le note contabili lette dal portale (più recenti) vincono sull'archivio; le correzioni a mano vincono su tutto
  const daCaricare = [...mesi.entries()].filter(([k]) => !manuali.has(k) && !daNote.has(k));
  const esito = { mesi: mesi.size, caricati: daCaricare.length, saltati: mesi.size - daCaricare.length,
    dal: righe.length ? Math.min(...righe.map(r => r.anno * 100 + r.mese)) : null, al: righe.length ? Math.max(...righe.map(r => r.anno * 100 + r.mese)) : null };
  if (opz.anteprima) return { ...esito, anteprima: true };
  for (const [, rr] of daCaricare)
    await salvaCostiMese(rr[0].anno, rr[0].mese, rr.map(r => ({ ...r, netto: r.netto ?? null })), 'archivio', { file: rr[0].file ?? null });
  return { ...esito, anteprima: false };
}

// ───────────────────────────── nota spese ─────────────────────────────

/** Totale e pagato per persona e anno (per l'elenco delle note e il riepilogo). */
export async function totaliNoteAnno(anno: number) {
  return q<{ dipendente_id: number; nome: string; mese: number; nota_id: number; km: number; altre: number; totale: number }>(`
    SELECT n.dipendente_id, d.nome, n.mese, n.id AS nota_id,
      coalesce(sum(r.km_andata * CASE WHEN r.andata_ritorno THEN 2 ELSE 1 END), 0)::float AS km,
      coalesce(sum(r.altre_spese), 0)::float AS altre,
      round(coalesce(sum(r.km_andata * CASE WHEN r.andata_ritorno THEN 2 ELSE 1 END), 0) * n.tariffa_km + coalesce(sum(r.altre_spese), 0), 2)::float AS totale
    FROM note_spese n JOIN dipendenti d ON d.id = n.dipendente_id LEFT JOIN note_spese_righe r ON r.nota_id = n.id
    WHERE n.anno = $1 GROUP BY n.id, d.nome ORDER BY d.nome, n.mese`, [anno]);
}

/**
 * Importa il "Modulo rimborso km" in Excel: foglio DATI (destinazioni con i km, persone con auto e tariffa) e i fogli
 * dei mesi (righe con una destinazione o altre spese). Le note di un mese già presenti per quella persona non si toccano.
 */
export async function importaModuloKm(file: Buffer): Promise<{ destinazioni: number; veicoli: number; note: number; righe: number; saltati: string[]; persona: string; anno: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as any);
  const dati = wb.getWorksheet('DATI');
  if (!dati) throw new Error('nel file non c\'è il foglio DATI: serve il "Modulo rimborso km"');
  const testo = (v: any): string => {
    if (v == null) return '';
    if (typeof v === 'object' && 'result' in v) return testo(v.result);
    if (typeof v === 'object' && 'richText' in v) return v.richText.map((t: any) => t.text).join('');
    return String(v).trim();
  };
  const numero = (v: any): number | null => { const t = testo(v).replace(',', '.'); const n = Number(t); return t && Number.isFinite(n) ? n : null; };
  // intestazioni del foglio DATI: VIAGGI | KM … NOME | AUTO | MODELLO | ANNO | COSTO KM
  const intest = new Map<string, number>();
  dati.getRow(1).eachCell((c, i) => { const t = testo(c.value).toUpperCase(); if (t && !intest.has(t)) intest.set(t, i); else if (t === 'ANNO') intest.set('ANNO_AUTO', i); });
  const colViaggi = intest.get('VIAGGI') ?? 1, colKm = intest.get('KM') ?? 2, colNome = intest.get('NOME');
  const destinazioni: { nome: string; km: number; prov: string | null }[] = [];
  const persone: { nome: string; marca: string; modello: string; anno: number | null; tariffa: number }[] = [];
  dati.eachRow((r, n) => {
    if (n === 1) return;
    const nome = testo(r.getCell(colViaggi).value).toUpperCase(), km = numero(r.getCell(colKm).value);
    if (nome && km != null) destinazioni.push({ nome, km, prov: testo(r.getCell(colKm + 1).value).toUpperCase() || null });
    if (colNome) {
      const p = testo(r.getCell(colNome).value).toUpperCase(), tariffa = numero(r.getCell(colNome + 4).value);
      if (p && tariffa != null) persone.push({ nome: p, marca: testo(r.getCell(colNome + 1).value).toUpperCase(), modello: testo(r.getCell(colNome + 2).value).toUpperCase(),
        anno: numero(r.getCell(colNome + 3).value), tariffa });
    }
  });
  const primo = wb.worksheets[0];
  const persona = testo(primo.getCell('C2').value).toUpperCase();
  const anno = numero(primo.getCell('G5').value) ?? new Date().getFullYear();
  if (!persona) throw new Error('nel primo foglio manca il nome del richiedente (casella C2)');
  const mesi = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
  const esito = { destinazioni: 0, veicoli: 0, note: 0, righe: 0, saltati: [] as string[], persona, anno };
  await transazione(async c => {
    for (const d of destinazioni) {
      const r = await c.query(`INSERT INTO rimborsi_destinazioni (nome, km_andata, provincia) VALUES ($1,$2,$3) ON CONFLICT (nome) DO NOTHING`, [d.nome, d.km, d.prov]);
      esito.destinazioni += r.rowCount ?? 0;
    }
    const idPersona = async (nome: string) => (await c.query(`INSERT INTO dipendenti (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = excluded.nome RETURNING id`, [nome])).rows[0].id as number;
    for (const p of persone) {
      const id = await idPersona(p.nome);
      if ((await c.query(`SELECT 1 FROM rimborsi_veicoli WHERE dipendente_id = $1 AND coalesce(modello, '') = $2 AND coalesce(anno, 0) = $3`, [id, p.modello, p.anno ?? 0])).rowCount) continue;
      await c.query(`INSERT INTO rimborsi_veicoli (dipendente_id, marca, modello, anno, tariffa_km) VALUES ($1,$2,$3,$4,$5)`, [id, p.marca || null, p.modello || null, p.anno, p.tariffa]);
      esito.veicoli++;
    }
    const dipId = await idPersona(persona);
    // l'auto della nota: come nel modulo (CERCA.VERT sul nome) la prima riga della persona nel foglio DATI, altrimenti la più recente;
    // ogni foglio del mese può avere la sua tariffa nella casella C4 (es. da luglio un'auto nuova): vince quella, con l'auto che ha la stessa tariffa
    const auto = (await c.query(`SELECT * FROM rimborsi_veicoli WHERE dipendente_id = $1 ORDER BY id`, [dipId])).rows;
    const prima = persone.find(p => p.nome === persona);
    const autoBase = (prima && auto.find(v => (v.modello ?? '') === prima.modello && Number(v.anno ?? 0) === (prima.anno ?? 0))) ?? auto[auto.length - 1] ?? null;
    const kmDi = new Map(destinazioni.map(d => [d.nome, d.km]));
    for (const [i, nomeMese] of mesi.entries()) {
      const ws = wb.getWorksheet(nomeMese);
      if (!ws) continue;
      const righe: { data: string; partenza: string; destinazione: string; altre: number; note: string; km: number }[] = [];
      for (let r = 9; r <= 39; r++) {
        const giorno = r - 8;
        const dest = testo(ws.getCell(`C${r}`).value).toUpperCase(), altre = numero(ws.getCell(`D${r}`).value) ?? 0;
        if (!dest && !altre) continue;
        const dt = new Date(Date.UTC(anno, i, giorno));
        if (dt.getUTCMonth() !== i) continue;
        // km di andata: il valore calcolato dal foglio; se la casella è vuota (stesso viaggio su più giorni, solo spese) niente km
        const e = ws.getCell(`E${r}`).value as any;
        const km = e == null ? 0 : (numero(e) ?? kmDi.get(dest) ?? 0);
        righe.push({ data: dt.toISOString().slice(0, 10), partenza: (testo(ws.getCell(`B${r}`).value) || 'SEDE').toUpperCase(), destinazione: dest, altre,
          note: testo(ws.getCell(`F${r}`).value), km });
      }
      if (!righe.length) continue;
      const gia = (await c.query(`SELECT 1 FROM note_spese WHERE dipendente_id = $1 AND anno = $2 AND mese = $3`, [dipId, anno, i + 1])).rowCount;
      if (gia) { esito.saltati.push(`${nomeMese.toLowerCase()} (nota già presente)`); continue; }
      const tariffaMese = numero(ws.getCell('C4').value);
      const veicolo = (tariffaMese != null && Number(autoBase?.tariffa_km) !== tariffaMese ? auto.find(v => Number(v.tariffa_km) === tariffaMese) : null) ?? autoBase;
      const nota = (await c.query(`INSERT INTO note_spese (dipendente_id, veicolo_id, anno, mese, tariffa_km, veicolo_testo, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [dipId, veicolo?.id ?? null, anno, i + 1, tariffaMese ?? veicolo?.tariffa_km ?? 0, veicolo ? [veicolo.marca, veicolo.modello, veicolo.anno].filter(Boolean).join(' ') : null, 'importata dal modulo Excel'])).rows[0].id;
      esito.note++;
      for (const x of righe) {
        await c.query(`INSERT INTO note_spese_righe (nota_id, data, partenza, destinazione, km_andata, altre_spese, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [nota, x.data, x.partenza, x.destinazione || null, x.km, x.altre, x.note || null]);
        esito.righe++;
      }
    }
  });
  return esito;
}
