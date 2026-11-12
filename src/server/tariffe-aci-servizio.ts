/**
 * Tariffe ACI nel database (Adriano 12/11/2026): caricamento del PDF della Gazzetta Ufficiale, ricerca per marca e modello,
 * tariffa nuova per le auto quando arrivano le tabelle dell'anno dopo. Regole in `engine/tariffe-aci.ts`.
 * La ricerca lavora su una copia in memoria dell'ultimo anno (circa 5.000 righe): niente query a ogni lettera scritta (Neon).
 */
import { q, q1, transazione } from './db.js';
import { testoPdf } from './testo-pdf.js';
import { annoTabelle, cercaTariffe, etichettaAci, leggiTabelleAci, type TariffaAci } from '../engine/tariffe-aci.js';

export type RigaAci = TariffaAci & { id: number; anno: number };

let copia: { anno: number; righe: RigaAci[] } | null = null;

/** Ultimo anno caricato (null = nessuna tabella). */
export async function ultimoAnnoAci(): Promise<number | null> {
  const r = await q1<{ anno: number | null }>(`SELECT max(anno) AS anno FROM tariffe_aci`);
  return r?.anno ?? null;
}

async function righeAnno(anno: number): Promise<RigaAci[]> {
  if (copia?.anno === anno) return copia.righe;
  const righe = (await q<any>(`SELECT id, anno, id_aci, marca, modello, alimentazione, produzione, costo_km::float AS costo FROM tariffe_aci WHERE anno = $1`, [anno]))
    .map(r => ({ id: r.id, anno: r.anno, idAci: r.id_aci, marca: r.marca, modello: r.modello, alimentazione: r.alimentazione, produzione: r.produzione, costoKm: r.costo }));
  copia = { anno, righe };
  return righe;
}

/** Ricerca per la pagina Persone e auto: le prime 25 righe dell'ultimo anno. */
export async function cercaAci(testo: string) {
  const anno = await ultimoAnnoAci();
  if (!anno) return { anno: null, righe: [] };
  return { anno, righe: cercaTariffe(await righeAnno(anno), testo).map(r => ({ ...r, etichetta: etichettaAci(r) })) };
}

/** Legge il PDF della Gazzetta e sostituisce le righe di quell'anno. */
export async function caricaTabelleAci(pdf: Buffer): Promise<{ anno: number; righe: number }> {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Il file non è un PDF: serve il PDF della Gazzetta Ufficiale con le tabelle ACI.');
  const testo = await testoPdf(pdf);
  const anno = annoTabelle(testo);
  const righe = leggiTabelleAci(testo);
  if (!anno || righe.length < 500)
    throw new Error(`Nel PDF non trovo le tabelle ACI (${righe.length} righe lette): serve il supplemento della Gazzetta Ufficiale "Tabelle nazionali dei costi chilometrici di esercizio di autovetture e motocicli".`);
  await transazione(async c => {
    await c.query(`DELETE FROM tariffe_aci WHERE anno = $1`, [anno]);
    for (let i = 0; i < righe.length; i += 500) {
      const pezzo = righe.slice(i, i + 500);
      const valori: unknown[] = [];
      const segnaposto = pezzo.map((r, j) => {
        valori.push(anno, r.idAci, r.marca, r.modello, r.alimentazione, r.produzione, r.costoKm);
        const b = j * 7;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
      });
      await c.query(`INSERT INTO tariffe_aci (anno, id_aci, marca, modello, alimentazione, produzione, costo_km) VALUES ${segnaposto.join(',')}`, valori);
    }
  });
  copia = null;
  return { anno, righe: righe.length };
}

/** Riga ACI scelta nella pagina (id della tabella): serve al salvataggio dell'auto. */
export async function rigaAci(id: number): Promise<RigaAci | null> {
  if (!(id > 0)) return null;
  const r = await q1<any>(`SELECT id, anno, id_aci, marca, modello, alimentazione, produzione, costo_km::float AS costo FROM tariffe_aci WHERE id = $1`, [id]);
  return r ? { id: r.id, anno: r.anno, idAci: r.id_aci, marca: r.marca, modello: r.modello, alimentazione: r.alimentazione, produzione: r.produzione, costoKm: r.costo } : null;
}

/**
 * Tariffa dell'ultimo anno per le auto collegate a una riga ACI di un anno precedente: stesso "ID Modello",
 * altrimenti stessa marca + modello + alimentazione. Chiave = id dell'auto.
 */
export async function tariffeNuove(veicoli: { id: number; aci_id: number | null; aci_anno: number | null; aci_testo: string | null; tariffa_km: number }[]) {
  const fuori = new Map<number, RigaAci>();
  const anno = await ultimoAnnoAci();
  const daGuardare = veicoli.filter(v => v.aci_anno && anno && v.aci_anno < anno);
  if (!anno || !daGuardare.length) return fuori;
  const righe = await righeAnno(anno);
  for (const v of daGuardare) {
    const r = (v.aci_id ? righe.find(x => x.idAci === v.aci_id) : undefined) ?? righe.find(x => etichettaAci(x) === v.aci_testo);
    if (r) fuori.set(v.id, r);
  }
  return fuori;
}

/** Porta le auto attive collegate all'ACI alla tariffa dell'ultimo anno (le note spese già fatte non cambiano: hanno la loro tariffa). */
export async function aggiornaAutoAci(): Promise<number> {
  const veicoli = await q<any>(`SELECT id, aci_id, aci_anno, aci_testo, tariffa_km::float AS tariffa_km FROM rimborsi_veicoli WHERE attivo AND aci_anno IS NOT NULL`);
  const nuove = await tariffeNuove(veicoli);
  for (const [id, r] of nuove)
    await q(`UPDATE rimborsi_veicoli SET tariffa_km = $2, aci_id = $3, aci_anno = $4, aci_testo = $5 WHERE id = $1`, [id, r.costoKm, r.idAci, r.anno, etichettaAci(r)]);
  return nuove.size;
}
