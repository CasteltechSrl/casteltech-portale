/**
 * Lettura con l'IA (API Anthropic) delle righe di BOM che le regole non riescono a capire:
 * righe senza P/N (es. "RES 2K2 0603") o con P/N non riconosciuto e nessun dato dai distributori.
 * L'IA restituisce famiglia e attributi nei campi Casteltech; i codici li calcolano sempre le regole del portale.
 * Chiave: ANTHROPIC_API_KEY (solo su Render). Modello: ANTHROPIC_MODEL (default claude-sonnet-5-5).
 */
import { ATTR, FAMIGLIE, type Attributi } from '../engine/codifica/regole.js';

export const iaConfigurata = () => !!process.env.ANTHROPIC_API_KEY;

export interface RigaDaLeggere { riga: number; dati: Record<string, string> }
export interface Lettura { famiglia: string | null; attributi: Attributi; nota?: string }

const ISTRUZIONI = `Sei l'ufficio tecnico di Casteltech, assemblaggio di schede elettroniche. Ricevi righe di una distinta base (BOM)
con le colonne originali. Per ogni riga individua il componente e restituisci la famiglia e i suoi dati tecnici.

Famiglie (sigla: nome): ${Object.entries(FAMIGLIE).map(([k, f]) => `${k}: ${f.nome}`).join('; ')}.

Attributi possibili: ${ATTR.join(', ')}, tecnologia (S = SMD, T = THT).
Formati: case come "0603", "SOT-23", "SOIC-8", "QFN-32"; valore come "2.2K" (ohm), "100n" (farad), "10u" (henry), "16MHz", "5.1V" (zener);
tolleranza solo numero in percento ("1", "5") o "20PPM" per i quarzi; tensione "50V"; potenza "100mW"; corrente "2A" o "20mA";
dielettrico "X7R"; colore LED in italiano (ROSSO, VERDE, BLU, GIALLO, ARANCIONE, BIANCO, AMBRA, IR, RGB); passo connettori in mm ("2.54");
poli = numero di contatti; tipo connettore: BASETTA, PRESA, MORSETTO, USBC, MICROUSB, RJ45, FFC, SDCARD, HDMI, COASSIALE.

Regole: non inventare. Se un dato non c'è o non è deducibile con certezza, non metterlo. Se la riga non è un componente
(es. PCB, note, componente da non montare "DNP/NC"), famiglia null e una nota breve.
Rispondi SOLO con un array JSON: [{"riga": <numero>, "famiglia": "<sigla o null>", "attributi": {...}, "nota": "<facoltativa, in italiano>"}]`;

/** Chiede all'IA famiglia e attributi delle righe (a gruppi di 40). */
export async function leggiConIa(righe: RigaDaLeggere[]): Promise<Map<number, Lettura>> {
  const out = new Map<number, Lettura>();
  if (!iaConfigurata() || !righe.length) return out;
  for (let i = 0; i < righe.length; i += 40) {
    const lotto = righe.slice(i, i + 40);
    const testo = lotto.map(r => `${r.riga}: ${Object.entries(r.dati).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' | ')}`).join('\n');
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: 8000, system: ISTRUZIONI,
          messages: [{ role: 'user', content: `Righe della BOM:\n${testo}` }] }),
      });
      const corpo: any = await r.json().catch(() => null);
      if (!r.ok) throw new Error(corpo?.error?.message ?? `errore ${r.status}`);
      const risposta = (corpo?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
      for (const x of leggiJson(risposta)) {
        const fam = typeof x?.famiglia === 'string' && x.famiglia.toUpperCase() in FAMIGLIE ? x.famiglia.toUpperCase() : null;
        const attributi: Attributi = {};
        for (const [k, v] of Object.entries(x?.attributi ?? {})) if ((ATTR as readonly string[]).includes(k) || k === 'tecnologia') if (v != null && String(v).trim()) (attributi as any)[k] = String(v).trim();
        out.set(Number(x?.riga), { famiglia: fam, attributi, nota: x?.nota ? String(x.nota).slice(0, 200) : undefined });
      }
    } finally { clearTimeout(t); }
  }
  return out;
}

/** Estrae l'array JSON anche se la risposta ha testo o ``` intorno. */
export function leggiJson(testo: string): any[] {
  const a = testo.indexOf('['), b = testo.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  try { const v = JSON.parse(testo.slice(a, b + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}
