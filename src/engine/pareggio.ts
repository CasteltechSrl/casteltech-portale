/**
 * Punto di pareggio e conto economico medio (Adriano 6/11/2026, dal file "Analisi CASTELTECH SRL" del commercialista):
 * i bilancini mensili del commercialista (saldi progressivi per conto) diventano valori del mese; i mesi che mancano si
 * completano con i dati del portale (fatture emesse, fatture dei fornitori, costo del personale) e, per le voci che il
 * portale non ha (ammortamenti, oneri finanziari, imposte…), con una stima = media dei mesi del commercialista o il
 * bilancio ufficiale diviso 12. La tabella mostra la MEDIA mensile di ogni voce nel periodo scelto, non i singoli mesi.
 *
 * Punto di pareggio (stessa logica del file): costi variabili = materie prime e di consumo; costi fissi = tutto il resto;
 * margine di contribuzione = (ricavi − variabili) / ricavi; fatturato di pareggio = costi fissi / margine.
 * Solo conti, nessuna lettura dal database: le letture stanno in `server/pareggio-servizio.ts`.
 */

export type Fonte = 'commercialista' | 'portale' | 'stima';

/** Le famiglie di voci: uguali per il commercialista (conti 7xx/8xx), per il portale (categorie di FIC) e per il bilancio ufficiale. */
export type CodiceFamiglia = 'ricavi' | 'materie' | 'servizi' | 'godimento' | 'personale' | 'compensi' | 'ammortamenti' | 'oneri' | 'finanziari' | 'senza_categoria';
export type TipoFamiglia = 'ricavo' | 'variabile' | 'fisso';

export interface Famiglia { codice: CodiceFamiglia; nome: string; tipo: TipoFamiglia; spiegazione: string }

export const FAMIGLIE: Famiglia[] = [
  { codice: 'ricavi', nome: 'Ricavi', tipo: 'ricavo', spiegazione: 'fatture emesse meno note di credito, più abbuoni, omaggi, sopravvenienze e proventi' },
  { codice: 'materie', nome: 'Materie prime e di consumo', tipo: 'variabile', spiegazione: 'componenti, PCB, materiali di consumo, imballaggi: crescono con il lavoro' },
  { codice: 'servizi', nome: 'Servizi e spese generali', tipo: 'fisso', spiegazione: 'energia, riscaldamento, pulizie, consulenze, assicurazioni, trasporti, auto, manutenzioni, cancelleria' },
  { codice: 'godimento', nome: 'Affitti, leasing e licenze', tipo: 'fisso', spiegazione: 'fitti passivi, canoni di leasing, licenze software' },
  { codice: 'personale', nome: 'Personale dipendente', tipo: 'fisso', spiegazione: 'stipendi, INPS, INAIL, TFR e altri costi dei dipendenti' },
  { codice: 'compensi', nome: 'Compensi amministratori', tipo: 'fisso', spiegazione: 'compenso del socio amministratore e i suoi contributi' },
  { codice: 'ammortamenti', nome: 'Ammortamenti', tipo: 'fisso', spiegazione: 'quote di macchinari, attrezzature, arredi e beni immateriali' },
  { codice: 'oneri', nome: 'Imposte, tasse e altri oneri', tipo: 'fisso', spiegazione: 'bolli, registro, rifiuti, diritti camerali, sanzioni, abbuoni passivi' },
  { codice: 'finanziari', nome: 'Oneri finanziari', tipo: 'fisso', spiegazione: 'interessi su mutui e conto corrente, commissioni, oneri bancari, cambi' },
  { codice: 'senza_categoria', nome: 'Fatture senza categoria', tipo: 'fisso', spiegazione: 'fatture dei fornitori senza categoria di costo nel portale (solo nei mesi presi dal portale)' },
];
export const famiglia = (c: CodiceFamiglia): Famiglia => FAMIGLIE.find(f => f.codice === c)!;

/** Famiglia dal conto del commercialista (le prime 3 cifre: 702 materie prime, 709 servizi…); null = conto che non entra (rimanenze iniziali, patrimoniale). */
export function famigliaDiConto(conto: string): CodiceFamiglia | null {
  const c = conto.trim();
  if (!/^\d{8}$/.test(c)) return null;
  const g = c.slice(0, 3);
  if (g === '701') return null;                       // rimanenze iniziali: non sono un costo del mese
  if (g === '702') return 'materie';
  if (['704', '709', '713', '714', '715'].includes(g)) return 'servizi';
  if (g === '717') return 'godimento';
  if (g === '720') return 'personale';
  if (g === '711') return 'compensi';
  if (g === '725' || g === '727') return 'ammortamenti';
  if (g === '735' || g === '737') return 'oneri';
  if (g === '740') return 'finanziari';
  if (c.startsWith('8')) return 'ricavi';
  if (c.startsWith('7')) return 'oneri';
  return null;
}

/** Famiglia dalla categoria di costo di una fattura ricevuta (es. "B6_Materie prime c/acqusti"). */
export function famigliaDiCategoria(categoria: string | null | undefined): CodiceFamiglia {
  const c = (categoria ?? '').trim().toLowerCase();
  if (!c) return 'senza_categoria';
  if (/^b6/.test(c)) return /cancelleria|pulizia/.test(c) ? 'servizi' : 'materie';
  if (/^b7/.test(c)) return /comp\.?\s*ammin|amministrator/.test(c) ? 'compensi' : 'servizi';
  if (/^b8/.test(c)) return 'godimento';
  if (/^b9/.test(c)) return 'personale';
  if (/^b1[0-2]/.test(c) || /ammortament/.test(c)) return 'ammortamenti';
  if (/^b14|imposte|sanzion/.test(c)) return 'oneri';
  if (/^c1[5-7]|interess|bancar|finanziament|leasing/.test(c)) return /leasing/.test(c) ? 'godimento' : 'finanziari';
  if (/componenti|materiale produzione|pcb|circuiti/.test(c)) return 'materie';
  return 'servizi';
}

// ── Lettura del bilancino del commercialista ──

export interface RigaFoglio { conto: string; descrizione: string; saldo: number }
export interface FoglioBilancino { nome: string; righe: RigaFoglio[] }
export interface VoceMese { anno: number; mese: number; conto: string; descrizione: string; importo: number; progressivo: number }

export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const nomeMeseIt = (m: number) => MESI[m - 1] ?? '';

/** Numero del mese dal nome del foglio ("GENNAIO", "Marzo ", "3", "2026-03"); null se non è un mese. */
export function meseDalNome(nome: string): number | null {
  const n = nome.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (/^[a-z]{3,}$/.test(n)) { const i = MESI.findIndex(m => m.startsWith(n) || n.startsWith(m)); return i >= 0 ? i + 1 : null; }
  const num = n.match(/^(?:\d{4}-)?(\d{1,2})$/);
  if (num && Number(num[1]) >= 1 && Number(num[1]) <= 12) return Number(num[1]);
  return null;
}

/**
 * Dai fogli mensili (saldi progressivi dall'inizio dell'anno, conti a 8 cifre) ai valori del mese: mese = progressivo − progressivo del
 * mese prima (dal file o, se il file parte più avanti, dai mesi già caricati). I conti a 3 cifre sono totali e si ricalcolano.
 */
export function leggiBilancino(fogli: FoglioBilancino[], anno: number, giaCaricati: VoceMese[] = []): { voci: VoceMese[]; mesi: number[]; avvisi: string[] } {
  const avvisi: string[] = [];
  const perMese = new Map<number, Map<string, { descrizione: string; saldo: number }>>();
  for (const f of fogli) {
    const m = meseDalNome(f.nome);
    if (!m) continue;
    const conti = new Map<string, { descrizione: string; saldo: number }>();
    for (const r of f.righe) {
      const fam = famigliaDiConto(r.conto);
      if (!fam || !Number.isFinite(r.saldo)) continue;
      const c = r.conto.trim();
      conti.set(c, { descrizione: r.descrizione.trim().replace(/\s+/g, ' ') || c, saldo: r2(r.saldo + (conti.get(c)?.saldo ?? 0)) });
    }
    if (conti.size) perMese.set(m, conti);
  }
  const mesi = [...perMese.keys()].sort((a, b) => a - b);
  if (!mesi.length) { avvisi.push('Nessun foglio con il nome di un mese (GENNAIO, FEBBRAIO…) e i conti del conto economico.'); return { voci: [], mesi, avvisi }; }
  const precedenti = new Map<number, Map<string, number>>();   // progressivi dei mesi già nel portale
  for (const v of giaCaricati) {
    if (v.anno !== anno) continue;
    if (!precedenti.has(v.mese)) precedenti.set(v.mese, new Map());
    precedenti.get(v.mese)!.set(v.conto, v.progressivo);
  }
  const voci: VoceMese[] = [];
  for (const m of mesi) {
    const conti = perMese.get(m)!;
    let prima: Map<string, number> | null = null;
    if (m > 1) {
      if (perMese.has(m - 1)) prima = new Map([...perMese.get(m - 1)!].map(([c, x]) => [c, x.saldo]));
      else if (precedenti.has(m - 1)) prima = precedenti.get(m - 1)!;
      else { avvisi.push(`${nomeMeseIt(m)}: manca ${nomeMeseIt(m - 1)} (nel file e nel portale), quindi il mese non si può calcolare e non viene caricato.`); continue; }
    }
    const tutti = new Set([...conti.keys(), ...(prima?.keys() ?? [])]);
    for (const c of tutti) {
      const attuale = conti.get(c), progressivo = attuale?.saldo ?? prima?.get(c) ?? 0;   // conto sparito dal foglio = progressivo fermo
      const importo = r2(progressivo - (prima?.get(c) ?? 0));
      voci.push({ anno, mese: m, conto: c, descrizione: attuale?.descrizione ?? descrizioneDa(giaCaricati, c) ?? c, importo, progressivo });
    }
  }
  return { voci, mesi: [...new Set(voci.map(v => v.mese))].sort((a, b) => a - b), avvisi };
}
const descrizioneDa = (voci: VoceMese[], conto: string) => voci.find(v => v.conto === conto)?.descrizione;

// ── Conto economico del periodo ──

export interface VocePortale { famiglia: CodiceFamiglia; voce: string; importo: number }
export interface MesePortale { anno: number; mese: number; voci: VocePortale[] }

/** Una riga del bilancio ufficiale (dal PDF depositato): valori dell'anno in euro, schema CEE abbreviato. */
export interface BilancioUfficiale {
  anno: number; ricavi: number; altriRicavi: number; variazioneRimanenzeProdotti: number; materie: number; variazioneRimanenzeMaterie: number;
  servizi: number; godimento: number; personale: number; ammortamenti: number; oneriDiversi: number; oneriFinanziari: number; imposte: number; utile: number;
  dipendenti?: number | null; compensiAmministratori?: number | null;
}

export interface Periodo { da: string; a: string }   // 'AAAA-MM' compresi

export function mesiDelPeriodo(p: Periodo): { anno: number; mese: number }[] {
  const [a1, m1] = p.da.split('-').map(Number), [a2, m2] = p.a.split('-').map(Number);
  const out: { anno: number; mese: number }[] = [];
  for (let a = a1, m = m1; a < a2 || (a === a2 && m <= m2); m++) { if (m > 12) { m = 1; a++; } if (a > a2 || (a === a2 && m > m2)) break; out.push({ anno: a, mese: m }); }
  return out;
}
export const chiaveMese = (anno: number, mese: number) => `${anno}-${String(mese).padStart(2, '0')}`;
export const periodoValido = (s: unknown) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export interface RigaDettaglio { voce: string; media: number; totale: number; mesi: number; fonte: Fonte }
export interface RigaFamiglia extends Famiglia { media: number; totale: number; dettagli: RigaDettaglio[]; fonti: Record<Fonte, number>; nota: string | null }

export interface Pareggio {
  ricaviMedi: number; variabiliMedi: number; fissiMedi: number; margineContribuzione: number | null;   // 0–1
  fatturatoPareggio: number | null; fatturatoPareggioAnno: number | null; utileMedio: number; acquistiAlPareggio: number | null;
}

export interface ContoEconomico {
  periodo: Periodo; mesi: { anno: number; mese: number; fonte: Fonte; stime: CodiceFamiglia[] }[]; nMesi: number;
  famiglie: RigaFamiglia[]; pareggio: Pareggio; avvisi: string[];
}

/**
 * Il conto economico medio del periodo. Per ogni mese: se c'è il bilancino del commercialista vale quello (fonte 'commercialista'),
 * altrimenti i dati del portale (fatture, fornitori, personale) e la stima per le famiglie che il portale non ha.
 */
export function contoEconomico(opz: {
  periodo: Periodo; commercialista: VoceMese[]; portale: MesePortale[]; bilanci: BilancioUfficiale[];
  /** famiglie che il portale copre quando il mese è del portale (le altre si stimano) */
  famigliePortale?: CodiceFamiglia[];
}): ContoEconomico {
  const famigliePortale = new Set<CodiceFamiglia>(opz.famigliePortale ?? ['ricavi', 'materie', 'servizi', 'godimento', 'personale', 'compensi', 'senza_categoria']);
  const mesiPeriodo = mesiDelPeriodo(opz.periodo);
  const nMesi = mesiPeriodo.length;
  const avvisi: string[] = [];
  const perMeseComm = new Map<string, VoceMese[]>();
  for (const v of opz.commercialista) { const k = chiaveMese(v.anno, v.mese); if (!perMeseComm.has(k)) perMeseComm.set(k, []); perMeseComm.get(k)!.push(v); }
  const perMesePort = new Map(opz.portale.map(m => [chiaveMese(m.anno, m.mese), m.voci]));

  type Acc = { totale: number; dettagli: Map<string, { totale: number; mesi: number; fonte: Fonte }>; fonti: Record<Fonte, number> };
  const acc = new Map<CodiceFamiglia, Acc>(FAMIGLIE.map(f => [f.codice, { totale: 0, dettagli: new Map(), fonti: { commercialista: 0, portale: 0, stima: 0 } }]));
  const aggiungi = (fam: CodiceFamiglia, voce: string, importo: number, fonte: Fonte) => {
    const a = acc.get(fam)!;
    a.totale += importo;
    const d = a.dettagli.get(voce) ?? { totale: 0, mesi: 0, fonte };
    d.totale += importo; d.mesi += 1; if (fonte !== 'commercialista') d.fonte = fonte;
    a.dettagli.set(voce, d);
  };
  const mesiOut: ContoEconomico['mesi'] = [];
  for (const { anno, mese } of mesiPeriodo) {
    const k = chiaveMese(anno, mese);
    const comm = perMeseComm.get(k);
    if (comm?.length) {
      for (const v of comm) { const fam = famigliaDiConto(v.conto); if (fam) aggiungi(fam, `${v.descrizione} (${v.conto})`, v.importo, 'commercialista'); }
      for (const f of FAMIGLIE) acc.get(f.codice)!.fonti.commercialista++;
      mesiOut.push({ anno, mese, fonte: 'commercialista', stime: [] });
      continue;
    }
    const port = perMesePort.get(k) ?? [];
    for (const v of port) aggiungi(v.famiglia, v.voce, v.importo, 'portale');
    const stime: CodiceFamiglia[] = [];
    for (const f of FAMIGLIE) {
      if (famigliePortale.has(f.codice)) { acc.get(f.codice)!.fonti.portale++; continue; }
      const s = stimaFamiglia(f.codice, anno, opz.commercialista, opz.bilanci);
      if (s) { if (s.importo) { aggiungi(f.codice, `${f.nome}: stima (${s.da})`, s.importo, 'stima'); stime.push(f.codice); } acc.get(f.codice)!.fonti.stima++; }
      else acc.get(f.codice)!.fonti.portale++;
    }
    mesiOut.push({ anno, mese, fonte: 'portale', stime });
  }
  const famiglie: RigaFamiglia[] = FAMIGLIE.map(f => {
    const a = acc.get(f.codice)!;
    const dettagli = [...a.dettagli].map(([voce, d]) => ({ voce, media: nMesi ? r2(d.totale / nMesi) : 0, totale: r2(d.totale), mesi: d.mesi, fonte: d.fonte }))
      .filter(d => d.totale !== 0).sort((x, y) => Math.abs(y.totale) - Math.abs(x.totale));
    return { ...f, media: nMesi ? r2(a.totale / nMesi) : 0, totale: r2(a.totale), dettagli, fonti: a.fonti, nota: notaFamiglia(f.codice, a.fonti, nMesi) };
  }).filter(f => f.totale !== 0 || f.codice !== 'senza_categoria');
  const ricaviMedi = famiglie.find(f => f.codice === 'ricavi')?.media ?? 0;
  const variabiliMedi = somma(famiglie.filter(f => f.tipo === 'variabile').map(f => f.media));
  const fissiMedi = somma(famiglie.filter(f => f.tipo === 'fisso').map(f => f.media));
  if (!nMesi) avvisi.push('Periodo vuoto.');
  const mesiComm = mesiOut.filter(m => m.fonte === 'commercialista').length;
  if (nMesi && !mesiComm) avvisi.push('Nessun mese del bilancino nel periodo: ricavi, acquisti e personale vengono dal portale, il resto è una stima.');
  return { periodo: opz.periodo, mesi: mesiOut, nMesi, famiglie, pareggio: puntoPareggio(ricaviMedi, variabiliMedi, fissiMedi), avvisi };
}

function notaFamiglia(codice: CodiceFamiglia, fonti: Record<Fonte, number>, nMesi: number): string | null {
  if (!nMesi) return null;
  if (fonti.commercialista === nMesi) return null;
  const parti: string[] = [];
  if (fonti.commercialista) parti.push(`${fonti.commercialista} ${fonti.commercialista === 1 ? 'mese' : 'mesi'} dal bilancino`);
  if (fonti.portale) parti.push(`${fonti.portale} dal portale`);
  if (fonti.stima) parti.push(`${fonti.stima} stimati`);
  if (codice === 'senza_categoria') return 'fatture ricevute senza categoria: potrebbero essere materie prime o servizi';
  return parti.join(', ');
}

/** Stima mensile di una famiglia: media dei mesi del commercialista dello stesso anno, poi il bilancio ufficiale ÷ 12, poi i mesi del commercialista di qualsiasi anno. */
export const MESI_PER_STIMA = 3;
export function stimaFamiglia(fam: CodiceFamiglia, anno: number, commercialista: VoceMese[], bilanci: BilancioUfficiale[]): { importo: number; da: string } | null {
  // media degli ULTIMI mesi del bilancino, non di tutto l'anno: un costo finito (il leasing, terminato a luglio 2026: Adriano 6/11/2026)
  // non deve continuare nei mesi stimati
  const mediaDa = (voci: VoceMese[], ultimi = MESI_PER_STIMA) => {
    const mesi = [...new Set(voci.map(v => chiaveMese(v.anno, v.mese)))].sort().slice(-ultimi);
    if (!mesi.length) return null;
    const tot = somma(voci.filter(v => mesi.includes(chiaveMese(v.anno, v.mese)) && famigliaDiConto(v.conto) === fam).map(v => v.importo));
    return { importo: r2(tot / mesi.length), mesi };
  };
  const stessoAnno = commercialista.filter(v => v.anno === anno);
  const m1 = mediaDa(stessoAnno);
  if (m1 != null) return { importo: m1.importo, da: m1.mesi.length === 1 ? `${nomeMeseIt(Number(m1.mesi[0].slice(5)))} ${anno} del bilancino` : `media ${nomeMeseIt(Number(m1.mesi[0].slice(5))).slice(0, 3)}–${nomeMeseIt(Number(m1.mesi[m1.mesi.length - 1].slice(5))).slice(0, 3)} ${anno} del bilancino` };
  const b = bilanci.find(x => x.anno === anno);
  if (b) { const v = daBilancio(b, fam); if (v != null) return { importo: r2(v / 12), da: `bilancio ${anno} ÷ 12` }; }
  const anni = [...new Set(commercialista.map(v => v.anno))].sort((x, y) => y - x);
  for (const a of anni) { const m = mediaDa(commercialista.filter(v => v.anno === a)); if (m != null) return { importo: m.importo, da: `media degli ultimi mesi ${a} del bilancino` }; }
  const ultimo = [...bilanci].sort((x, y) => y.anno - x.anno)[0];
  if (ultimo) { const v = daBilancio(ultimo, fam); if (v != null) return { importo: r2(v / 12), da: `bilancio ${ultimo.anno} ÷ 12` }; }
  return null;
}

/** La famiglia letta dal bilancio ufficiale (schema CEE): i compensi degli amministratori stanno dentro i servizi (B7), quindi 'compensi' non si stima da qui. */
export function daBilancio(b: BilancioUfficiale, fam: CodiceFamiglia): number | null {
  switch (fam) {
    case 'ricavi': return b.ricavi + b.altriRicavi + b.variazioneRimanenzeProdotti;
    case 'materie': return b.materie + b.variazioneRimanenzeMaterie;
    case 'servizi': return b.servizi;
    case 'godimento': return b.godimento;
    case 'personale': return b.personale;
    case 'ammortamenti': return b.ammortamenti;
    case 'oneri': return b.oneriDiversi;
    case 'finanziari': return b.oneriFinanziari;
    default: return null;
  }
}

/** Punto di pareggio dalle medie mensili: costi fissi ÷ margine di contribuzione. */
export function puntoPareggio(ricaviMedi: number, variabiliMedi: number, fissiMedi: number): Pareggio {
  const margine = ricaviMedi > 0 ? (ricaviMedi - variabiliMedi) / ricaviMedi : null;
  const pareggio = margine != null && margine > 0 ? r2(fissiMedi / margine) : null;
  return {
    ricaviMedi: r2(ricaviMedi), variabiliMedi: r2(variabiliMedi), fissiMedi: r2(fissiMedi), margineContribuzione: margine,
    fatturatoPareggio: pareggio, fatturatoPareggioAnno: pareggio != null ? r2(pareggio * 12) : null,
    utileMedio: r2(ricaviMedi - variabiliMedi - fissiMedi), acquistiAlPareggio: pareggio != null && margine != null ? r2(pareggio * (1 - margine)) : null,
  };
}

/** Utile mensile con un fatturato ipotizzato (la colonna "Valutativo" del file): fatturato × margine − costi fissi. */
export function utileConFatturato(p: Pareggio, fatturato: number): number | null {
  return p.margineContribuzione == null ? null : r2(fatturato * p.margineContribuzione - p.fissiMedi);
}

/** Il bilancio ufficiale letto con la stessa regola del pareggio (anno intero e media mensile). */
export function pareggioDaBilancio(b: BilancioUfficiale): Pareggio & { utileBilancio: number; risultatoPrimaImposte: number } {
  const ricavi = daBilancio(b, 'ricavi')!, variabili = daBilancio(b, 'materie')!;
  const fissi = b.servizi + b.godimento + b.personale + b.ammortamenti + b.oneriDiversi + b.oneriFinanziari;
  return { ...puntoPareggio(ricavi / 12, variabili / 12, fissi / 12), utileBilancio: b.utile, risultatoPrimaImposte: r2(ricavi - variabili - fissi) };
}

// ── Verifica tra il commercialista e il portale ──

export interface ConfrontoMese {
  anno: number; mese: number;
  voci: { nome: string; commercialista: number; portale: number; differenza: number; pct: number | null; segnala: boolean }[];
}

/** Per i mesi con il bilancino: ricavi, materie prime e personale del commercialista contro fatture, fatture ricevute e buste paga del portale. */
export function confrontoConPortale(commercialista: VoceMese[], portale: MesePortale[], opz = { soglia: 500, pct: 5 }): ConfrontoMese[] {
  const perMese = new Map<string, VoceMese[]>();
  for (const v of commercialista) { const k = chiaveMese(v.anno, v.mese); (perMese.get(k) ?? perMese.set(k, []).get(k)!).push(v); }
  const out: ConfrontoMese[] = [];
  const famiglieConfronto: [CodiceFamiglia, string][] = [['ricavi', 'Ricavi / fatture emesse'], ['materie', 'Materie prime / fatture ricevute B6'], ['personale', 'Personale / buste paga'], ['compensi', 'Compensi amministratore']];
  for (const p of [...portale].sort((x, y) => chiaveMese(x.anno, x.mese).localeCompare(chiaveMese(y.anno, y.mese)))) {
    const comm = perMese.get(chiaveMese(p.anno, p.mese));
    if (!comm) continue;
    const voci = famiglieConfronto.map(([fam, nome]) => {
      const c = r2(somma(comm.filter(v => famigliaDiConto(v.conto) === fam).map(v => v.importo)));
      const pr = r2(somma(p.voci.filter(v => v.famiglia === fam).map(v => v.importo)));
      const differenza = r2(pr - c);
      const pct = c ? Math.round((differenza / Math.abs(c)) * 1000) / 10 : null;
      return { nome, commercialista: c, portale: pr, differenza, pct, segnala: Math.abs(differenza) > opz.soglia && (pct == null || Math.abs(pct) > opz.pct) };
    });
    out.push({ anno: p.anno, mese: p.mese, voci });
  }
  return out;
}

// ── Bilanci ufficiali (file JSON preparato dai PDF depositati) ──

const CAMPI_BILANCIO: (keyof BilancioUfficiale)[] = ['anno', 'ricavi', 'altriRicavi', 'variazioneRimanenzeProdotti', 'materie', 'variazioneRimanenzeMaterie', 'servizi',
  'godimento', 'personale', 'ammortamenti', 'oneriDiversi', 'oneriFinanziari', 'imposte', 'utile'];

/** Controlla il file dei bilanci: ogni riga ha l'anno e i numeri; righe sbagliate in `errori`. */
export function leggiBilanciUfficiali(righe: unknown): { bilanci: BilancioUfficiale[]; errori: string[] } {
  const errori: string[] = [], bilanci: BilancioUfficiale[] = [];
  if (!Array.isArray(righe)) return { bilanci, errori: ['Il file deve contenere l\'elenco "bilanci".'] };
  for (const r of righe) {
    const o = r as Record<string, unknown>;
    const anno = Number(o?.anno);
    if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) { errori.push(`Riga senza anno valido: ${JSON.stringify(r).slice(0, 60)}`); continue; }
    const b: Record<string, unknown> = { anno };
    let ok = true;
    for (const c of CAMPI_BILANCIO) {
      if (c === 'anno') continue;
      const v = o[c] == null || o[c] === '' ? 0 : Number(o[c]);
      if (!Number.isFinite(v)) { errori.push(`${anno}: "${c}" non è un numero`); ok = false; break; }
      b[c] = r2(v);
    }
    if (!ok) continue;
    b.dipendenti = o.dipendenti == null ? null : Number(o.dipendenti);
    b.compensiAmministratori = o.compensiAmministratori == null ? null : Number(o.compensiAmministratori);
    bilanci.push(b as unknown as BilancioUfficiale);
  }
  return { bilanci: bilanci.sort((x, y) => x.anno - y.anno), errori };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const somma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
