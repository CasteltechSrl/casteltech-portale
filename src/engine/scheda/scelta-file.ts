/**
 * Quali file di una cartella del cliente vale la pena caricare (Adriano, 29/10/2026: "non deve acquisirla tutta, ma capire che cosa
 * ha senso acquisire e importare lo stretto necessario"). Si decide dal solo nome e dalla dimensione, PRIMA di mandare il file:
 * PDF, modelli 3D (uno STEP può pesare 80 MB), immagini, ODB++ e file che il portale non legge restano sul Drive e nel pacchetto
 * compare solo il nome. I file senza estensione o con estensioni dei CAD (.gdo, .art…) si caricano: il tipo si capisce dal contenuto.
 * Nessun accesso al database.
 */
import { FAMIGLIE } from '../codifica/regole.js';
import { ESTENSIONI_NON_LETTE, estensione, tipoFile } from './classifica.js';

/** Oltre questa dimensione un file non si legge (troppo pesante per il server). */
export const MAX_FILE = 25 * 1024 * 1024;
/** Gli zip si aprono sul server: si caricano fino a questa dimensione (stesso limite del caricamento). */
export const MAX_ZIP = 60 * 1024 * 1024;
export const CARTELLE_VECCHIE = /(^|[\\/])(OLD|VECCHI|VECCHIO|OBSOLET[EIO]|ARCHIVIO|BACKUP)([\\/])/i;
/** Cartelle di lavoro di Casteltech che finiscono nella cartella del cliente (programmi degli armadi, topografici): non sono del cliente. */
export const CARTELLE_CASTELTECH = /(^|[\\/])(ARMADI|TOPOGRAFIC[OI])([\\/])/i;
const FILE_DI_SISTEMA = /(^|[\\/])(desktop\.ini|thumbs\.db|\.ds_store|\._[^\\/]*)$|(^|[\\/])__MACOSX[\\/]/i;

export const NON_CONSERVATO = 'non caricato: resta sul Drive';
export const TROPPO_GRANDE = 'troppo grande: non caricato, resta sul Drive';
export const VERSIONI_VECCHIE = 'in una cartella di versioni vecchie: ignorato';
export const LAVORATO_CASTELTECH = 'file lavorato da Casteltech (codici di produzione), non del cliente: ignorato';
export const CARTELLA_CASTELTECH = 'cartella di lavoro di Casteltech (Armadi, Topografico), non del cliente: ignorato';

export type Scelta = { carica: true } | { carica: false; motivo: string; sistema?: boolean };

/** Radici delle cartelle ODB++ scompattate (contengono matrix/matrix), dai soli percorsi. */
export const radiciOdb = (nomi: string[]) =>
  [...new Set(nomi.map(n => /^(.*?[\\/]|)matrix[\\/]matrix$/i.exec(n)?.[1]).filter((x): x is string => x != null))];

/** Decide se un file va caricato. `odb` = radici ODB++ trovate nella stessa cartella (vedi radiciOdb). */
export function sceltaFile(nome: string, byte: number, odb: string[] = []): Scelta {
  if (FILE_DI_SISTEMA.test(nome)) return { carica: false, motivo: 'file di sistema', sistema: true };
  if (CARTELLE_VECCHIE.test(`/${nome}`)) return { carica: false, motivo: VERSIONI_VECCHIE };
  if (CARTELLE_CASTELTECH.test(`/${nome}`)) return { carica: false, motivo: CARTELLA_CASTELTECH };
  if (odb.some(r => nome.startsWith(r))) return { carica: false, motivo: NON_CONSERVATO };
  const tipo = tipoFile(nome, null), e = estensione(nome);
  if (['pdf', 'disegno-3d', 'immagine', 'odb'].includes(tipo) || ESTENSIONI_NON_LETTE.has(e)) return { carica: false, motivo: NON_CONSERVATO };
  if (tipo === 'archivio') {
    if (e !== 'zip') return { carica: false, motivo: 'archivio .' + e + ' non letto (solo zip): resta sul Drive' };
    return byte > MAX_ZIP ? { carica: false, motivo: TROPPO_GRANDE } : { carica: true };
  }
  return byte > MAX_FILE ? { carica: false, motivo: TROPPO_GRANDE } : { carica: true };
}

/** Divide l'elenco di una cartella: file da caricare e file che restano solo nell'elenco (con il motivo). */
export function scegliFile(file: { nome: string; byte: number }[]) {
  const odb = radiciOdb(file.map(f => f.nome));
  const carica: string[] = [], soloElenco: { nome: string; byte: number; motivo: string }[] = [];
  for (const f of file) {
    const s = sceltaFile(f.nome, f.byte, odb);
    if (s.carica) carica.push(f.nome);
    else if (!s.sistema) soloElenco.push({ ...f, motivo: s.motivo });
  }
  return { carica, soloElenco };
}

/**
 * Pick and place o BOM già lavorati da Casteltech (es. pick and place divisi per programma macchina con il codice di produzione
 * CC-0402-100NF-10-X7R-50V in fondo alla riga): il cliente non li ha mandati, mescolati ai suoi falsano l'incrocio.
 * Si riconoscono quando almeno un terzo delle righe (e almeno 5) porta un codice di produzione.
 */
const CODICE_PRODUZIONE = new RegExp(`(^|[\\s;,"'\\t])(${Object.keys(FAMIGLIE).join('|')})-[A-Z0-9.]+-[A-Z0-9.]+`);
export function lavoratoDaCasteltech(testo: string): boolean {
  const righe = testo.split(/\r?\n/).filter(l => l.trim()).slice(0, 2000);
  const conCodice = righe.filter(l => CODICE_PRODUZIONE.test(l)).length;
  return conCodice >= 5 && conCodice * 3 >= righe.length;
}
