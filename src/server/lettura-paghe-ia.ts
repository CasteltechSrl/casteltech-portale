/**
 * Lettura con l'IA dei documenti dello studio paghe che servono ai conti: nota contabile (costo del mese per qualifica)
 * e F24 (scadenza e totale). I cedolini e i riepiloghi NON passano mai dall'IA: hanno i dati delle singole persone.
 */
import { chiediTestoIa, iaConfigurata } from './ia.js';
import { oggettoJson } from '../engine/acquisizioni.js';
import { normalizzaF24Ia, normalizzaNotaIa, type F24Letto, type NotaLetta } from '../engine/dipendenti.js';

const ISTRUZIONI_NOTA = `Sei l'amministrazione di Casteltech S.r.l. Ricevi la NOTA CONTABILE delle paghe di un mese, fatta dallo studio paghe
(o il "bilancino di verifica" del vecchio studio). Per ogni qualifica (OPERAIO, IMPIEGATO, APPRENDISTA, SOCIO…; se c'è anche "TUTTE" non scriverla)
estrai: lordo = "TOTALE RETRIBUZIONI LORDE" (o i conti di costo Salari e stipendi / Compensi), contributi = "DI CUI A CARICO AZIENDA"
(contributi INPS a carico dell'azienda), tfr = "Tratt. fine rapporto" (non il netto), altri = "TOTALE VERSAMENTI AGGIUNTIVI" più METASALUTE,
netto = "TOTALI NETTI IN BUSTA". Importi in euro come numeri (punto per i decimali). Se il documento NON è una nota contabile delle paghe
rispondi {"nota_contabile": false}. Non inventare. Rispondi SOLO con il JSON:
{"nota_contabile": true, "anno": 2026, "mese": 8, "qualifiche": [{"qualifica": "OPERAIO", "lordo": 0, "contributi": 0, "tfr": 0, "altri": 0, "netto": 0}]}`;

const ISTRUZIONI_F24 = `Sei l'amministrazione di Casteltech S.r.l. Ricevi un modello F24 (versamento di ritenute, contributi INPS, INAIL, addizionali).
Estrai la data di scadenza del versamento (AAAA-MM-GG), il SALDO FINALE in euro e le righe: sezione (ERARIO, INPS, REGIONI, IMU E ALTRI TRIBUTI LOCALI, INAIL, ALTRI ENTI),
codice tributo o causale, periodo di riferimento, importo a debito (a credito con il segno meno). Se non è un F24 rispondi {"f24": false}. Non inventare.
Rispondi SOLO con il JSON: {"f24": true, "scadenza": "AAAA-MM-GG", "totale": 0, "righe": [{"sezione": "", "codice": "", "periodo": "", "importo": 0}]}`;

async function chiedi(pdf: Buffer, nome: string, sistema: string, voce: string): Promise<any> {
  if (!iaConfigurata()) throw new Error("manca la chiave dell'IA (ANTHROPIC_API_KEY su Render)");
  const risposta = await chiediTestoIa(voce, {
    max_tokens: 4000, system: sistema,
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') }, title: nome },
      { type: 'text', text: 'Leggi il documento e rispondi con il JSON.' },
    ] }],
  }, 120_000);
  const x = oggettoJson(risposta);
  if (!x) throw new Error("l'IA non ha restituito dati leggibili");
  return x;
}

export async function leggiNotaContabileConIa(pdf: Buffer, nome: string): Promise<NotaLetta | 'non_nota'> {
  const x = await chiedi(pdf, nome, ISTRUZIONI_NOTA, 'lettura paghe');
  if (x?.nota_contabile === false) return 'non_nota';
  const n = normalizzaNotaIa(x);
  if (!n) throw new Error('mese o anno della nota contabile non letti');
  return n;
}

export async function leggiF24ConIa(pdf: Buffer, nome: string): Promise<F24Letto | 'non_f24'> {
  const x = await chiedi(pdf, nome, ISTRUZIONI_F24, 'lettura paghe');
  if (x?.f24 === false) return 'non_f24';
  return normalizzaF24Ia(x);
}
