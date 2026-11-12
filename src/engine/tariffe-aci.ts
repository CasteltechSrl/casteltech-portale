/**
 * Tariffe chilometriche ACI (Adriano 12/11/2026): le "Tabelle nazionali dei costi chilometrici di esercizio di autovetture e motocicli"
 * che l'Agenzia delle Entrate pubblica ogni dicembre nella Gazzetta Ufficiale (supplemento ordinario, valgono dal 1° gennaio dell'anno dopo).
 * Si legge il TESTO del PDF della Gazzetta (`testoPdf`, come pdftotext -layout): una riga per modello con
 *   ID modello · MARCA · MODELLO · COSTO KM 15.000 KM · fringe benefit…
 * e i titoli delle sezioni ("AUTOVEICOLI A GASOLIO IN PRODUZIONE", "AUTOVEICOLI ELETTRICI FUORI PRODUZIONE", "MOTOCICLI"…).
 * Il costo al km è quello della tabella (percorrenza di 15.000 km all'anno): è la tariffa proposta per il rimborso chilometrico.
 */

export type TariffaAci = {
  idAci: number | null;      // "ID Modello" dell'ACI: resta uguale da un anno all'altro
  marca: string;
  modello: string;
  alimentazione: string;     // BENZINA, GASOLIO, IBRIDO-BENZINA, ELETTRICI, IBRIDI PLUG-IN, BENZINA-GPL…, MOTO
  produzione: boolean;       // true = "in produzione", false = "fuori produzione"
  costoKm: number;           // € al km (15.000 km all'anno)
};

const TITOLO_AUTO = /AUTOVEICOLI\s+(?:A\s+)?(.+?)\s+(IN|FUORI)\s+PRODUZIONE/i;
const TITOLO_MOTO = /^\s*(MOTOCICLI|MOTOVEICOLI)(?:\s+(.+?))?\s*$/i;
// riga: [ID] spazi MARCA (due o più spazi) MODELLO spazi 0,1234 spazi altro numero
const RIGA = /^\s*(?:(\d{2,6})\s{2,})?(\S.*?)\s{2,}(\S.*?)\s+(\d,\d{4})\s+\d/;

/** Anno delle tabelle dal testo ("FRINGE BENEFIT 2026"); null se non si trova. */
export function annoTabelle(testo: string): number | null {
  const m = testo.match(/FRINGE\s+BENEFIT\s+(20\d\d)/i);
  return m ? Number(m[1]) : null;
}

/** Tutte le righe delle tabelle, senza doppioni (stessa marca + modello + alimentazione: vale la prima). */
export function leggiTabelleAci(testo: string): TariffaAci[] {
  let alimentazione = '', produzione = true;
  const fuori: TariffaAci[] = [];
  const visti = new Set<string>();
  for (const linea of testo.split(/\r?\n/)) {
    const t = linea.match(TITOLO_AUTO);
    if (t && !/\d,\d{4}/.test(linea)) {
      alimentazione = t[1].toUpperCase().replace(/\s+/g, ' ').trim();
      produzione = t[2].toUpperCase() === 'IN';
      continue;
    }
    const mo = linea.match(TITOLO_MOTO);
    if (mo) { alimentazione = mo[2] ? `MOTO ${mo[2].toUpperCase()}` : 'MOTO'; produzione = true; continue; }
    if (!alimentazione) continue;
    const r = linea.match(RIGA);
    if (!r) continue;
    const marca = r[2].replace(/\s+/g, ' ').trim().toUpperCase(), modello = r[3].replace(/\s+/g, ' ').trim().toUpperCase();
    const costoKm = Number(r[4].replace(',', '.'));
    if (!marca || !modello || !(costoKm > 0 && costoKm < 5)) continue;
    const chiave = `${marca}|${modello}|${alimentazione}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    fuori.push({ idAci: r[1] ? Number(r[1]) : null, marca, modello, alimentazione, produzione, costoKm });
  }
  return fuori;
}

/** Testo semplice per la ricerca: maiuscolo, senza accenti, solo lettere e numeri separati da uno spazio. */
export const normaleAci = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/**
 * Ricerca di un'auto: ogni parola scritta deve esserci (all'inizio di una parola di marca/modello/alimentazione, "PASS" trova PASSAT),
 * prima i modelli in produzione, poi quelli che cominciano con la prima parola, poi in ordine di marca e modello.
 */
export function cercaTariffe<T extends Pick<TariffaAci, 'marca' | 'modello' | 'alimentazione' | 'produzione'>>(elenco: T[], testo: string, quante = 25): T[] {
  const parole = normaleAci(testo).split(' ').filter(Boolean);
  if (!parole.length) return [];
  const trovate = elenco.filter(t => {
    const dove = ` ${normaleAci(`${t.marca} ${t.modello} ${t.alimentazione}`)}`;
    return parole.every(p => dove.includes(` ${p}`));
  });
  const inizio = ` ${parole[0]}`;
  return trovate.sort((a, b) =>
    Number(b.produzione) - Number(a.produzione)
    || Number(` ${normaleAci(b.marca)}`.startsWith(inizio)) - Number(` ${normaleAci(a.marca)}`.startsWith(inizio))
    || a.marca.localeCompare(b.marca) || a.modello.localeCompare(b.modello)).slice(0, quante);
}

/** Etichetta di una riga ACI nell'elenco della ricerca e nella nota sotto l'auto. */
export const etichettaAci = (t: Pick<TariffaAci, 'marca' | 'modello' | 'alimentazione' | 'produzione'>) =>
  `${t.marca} ${t.modello} · ${t.alimentazione.toLowerCase()}${t.produzione ? '' : ' (fuori produzione)'}`;

/**
 * La tabella dell'anno in corso manca? Le nuove escono a fine dicembre: dal 1° gennaio, se l'ultima caricata è dell'anno prima
 * (o non ce n'è nessuna), la pagina lo dice.
 */
export const tabellaDaCaricare = (ultimoAnno: number | null, annoOggi: number) => ultimoAnno == null || ultimoAnno < annoOggi;
