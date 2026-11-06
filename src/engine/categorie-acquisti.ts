/**
 * Categorie di Adriano per le righe delle fatture dei fornitori (Adriano 6/11/2026: "un'analisi dettagliata delle fatture andando a leggere
 * ogni singola fattura e attribuendo di conseguenza la categoria. Le mie categorie possono essere diverse da quelle del commercialista").
 * Quattro gruppi: materiale che compriamo e RIVENDIAMO dentro le schede (componenti, PCB, lamine), materiali di CONSUMO della produzione
 * (stagno, flussante, pasta, pulizia, imballaggio…), LAVORAZIONI esterne e collaborazioni (la trasformazione), SPESE DI GESTIONE per tipo.
 * Solo regole (niente database): prima le parole della descrizione, poi il fornitore; quello che resta è "da verificare" (l'IA o l'ufficio).
 * Test in tests/categorie-acquisti.test.ts.
 */

export type Macro = 'rivendita' | 'consumo' | 'lavorazioni' | 'gestione';
export const NOMI_MACRO: Record<Macro, string> = {
  rivendita: 'Materiale rivenduto nelle schede', consumo: 'Materiali di consumo', lavorazioni: 'Lavorazioni e collaborazioni esterne', gestione: 'Spese di gestione',
};
export const SPIEGAZIONE_MACRO: Record<Macro, string> = {
  rivendita: 'componenti, PCB e lamine comprati per conto del cliente e rivenduti dentro il prezzo delle schede: crescono con il lavoro',
  consumo: 'quello che si consuma producendo e non si rivende: stagno, pasta, flussante, pulizia, punte, nastri, imballaggi, DPI',
  lavorazioni: 'montaggi e lavorazioni fatti fuori, progettazione, ricerca e sviluppo, consulenze tecniche sulla produzione',
  gestione: 'tutto il resto: affitto, leasing, energia, consulenze amministrative, trasporti, auto, software, sicurezza, ufficio',
};

export interface Categoria { codice: string; macro: Macro; nome: string }
export const CATEGORIE: Categoria[] = [
  { codice: 'componenti', macro: 'rivendita', nome: 'Componenti elettronici' },
  { codice: 'pcb', macro: 'rivendita', nome: 'Circuiti stampati (PCB)' },
  { codice: 'lamine', macro: 'rivendita', nome: 'Lamine (stencil)' },
  { codice: 'meccanica', macro: 'rivendita', nome: 'Meccanica, cavi, batterie e altro materiale di commessa' },
  { codice: 'stagno', macro: 'consumo', nome: 'Stagno, pasta saldante, flussante' },
  { codice: 'chimici', macro: 'consumo', nome: 'Pulizia e chimici (IPA, flux remover, acqua distillata, coating)' },
  { codice: 'ricambi_saldatura', macro: 'consumo', nome: 'Punte, ricambi e attrezzi di saldatura' },
  { codice: 'nastri_esd', macro: 'consumo', nome: 'Nastri, Kapton, materiale ESD, minuteria di produzione' },
  { codice: 'imballaggio', macro: 'consumo', nome: 'Imballaggi' },
  { codice: 'dpi', macro: 'consumo', nome: 'Abbigliamento, DPI e materiale per le persone' },
  { codice: 'montaggi_esterni', macro: 'lavorazioni', nome: 'Montaggi e lavorazioni fatti fuori' },
  { codice: 'progettazione', macro: 'lavorazioni', nome: 'Progettazione e sviluppo PCB' },
  { codice: 'ricerca_sviluppo', macro: 'lavorazioni', nome: 'Ricerca e sviluppo' },
  { codice: 'consulenze_tecniche', macro: 'lavorazioni', nome: 'Consulenze tecniche e informatiche' },
  { codice: 'affitto', macro: 'gestione', nome: 'Affitto' },
  { codice: 'leasing', macro: 'gestione', nome: 'Leasing e noleggi' },
  { codice: 'energia', macro: 'gestione', nome: 'Energia elettrica' },
  { codice: 'gas_acqua', macro: 'gestione', nome: 'Gas, acqua e riscaldamento' },
  { codice: 'manutenzioni', macro: 'gestione', nome: 'Manutenzione e ricambi delle macchine' },
  { codice: 'attrezzature', macro: 'gestione', nome: 'Attrezzature, macchine e investimenti' },
  { codice: 'consulenze_amministrative', macro: 'gestione', nome: 'Commercialista, paghe, notaio, consulenze amministrative' },
  { codice: 'sicurezza', macro: 'gestione', nome: 'Sicurezza, sorveglianza, medico del lavoro, formazione obbligatoria' },
  { codice: 'trasporti', macro: 'gestione', nome: 'Trasporti e corrieri' },
  { codice: 'dogane', macro: 'gestione', nome: 'Dogane e dazi' },
  { codice: 'auto', macro: 'gestione', nome: 'Auto: carburante, pedaggi, manutenzione' },
  { codice: 'telefonia', macro: 'gestione', nome: 'Telefono e internet' },
  { codice: 'software', macro: 'gestione', nome: 'Software, cloud, siti e abbonamenti' },
  { codice: 'ufficio', macro: 'gestione', nome: 'Ufficio, cancelleria, piccole attrezzature, varie' },
  { codice: 'pulizie', macro: 'gestione', nome: 'Pulizie dei locali e igiene' },
  { codice: 'mensa', macro: 'gestione', nome: 'Mensa, distributori, ristoranti' },
  { codice: 'commerciale', macro: 'gestione', nome: 'Pubblicità, fiere, commerciale' },
  { codice: 'assicurazioni', macro: 'gestione', nome: 'Assicurazioni' },
  { codice: 'banca', macro: 'gestione', nome: 'Banca, interessi, spese di incasso' },
  { codice: 'imposte', macro: 'gestione', nome: 'Bolli, imposte e diritti' },
  { codice: 'altro', macro: 'gestione', nome: 'Altre spese' },
];
const PER_CODICE = new Map(CATEGORIE.map(c => [c.codice, c]));
export const categoria = (codice: string): Categoria => PER_CODICE.get(codice) ?? PER_CODICE.get('altro')!;

export interface RigaDaClassificare { fornitore: string; descrizione: string; codici?: string[]; importo?: number }
export interface Esito { categoria: string; macro: Macro; come: 'parola' | 'fornitore' | 'nessuna'; accessoria?: boolean }

/** Parole nella descrizione che decidono da sole (prima del fornitore). In ordine: la prima che trova vince. */
const PAROLE: [RegExp, string][] = [
  [/\b(marca|imposta) da bollo\b|\bbollo virtuale\b|\bimposta di bollo\b|\bimposta di registro\b|diritti camerali|\bdiritti liq/i, 'imposte'],
  [/\bspese? (di )?incasso\b|\bcommissioni? bancari|\binteressi\b|rimborso spese incasso|rimborso spese amministrative/i, 'banca'],
  [/\bcanon[ei] (di )?leasing\b|\bleasing\b|indicizzazione/i, 'leasing'],
  [/\bcanone di locazione\b|\blocazione\b|\baffitto\b/i, 'affitto'],
  [/oneri doganali|\bdazio\b|\bdogan|duty tax|bolla doganale/i, 'dogane'],
  [/\blamin[ae]\b|\bstencil\b|\bzelflex\b|\bimpianto stampa\b/i, 'lamine'],
  [/\bpasta saldante\b|\bstagno\b|\bfluss?ante\b|\bflux\b(?! remover)|\bfilo (di )?stagno\b|\bsac ?\d|\blega\b|\bverghe\b|\bpf305|\brefill\b|\bsolder paste\b/i, 'stagno'],
  [/flux remover|isopropanol|\bipa\b|acqua bidistillata|\bdetergente\b|\bcoating\b|\balcool\b|\bsolvente\b|\bresin[ae]\b|elan-tron/i, 'chimici'],
  [/\bpunt[ae] (saldant|cacciavite|\d)|\bpunta\b.*\bmm\b|heating element|\bnozzle\b|\bspugnetta\b|\bsaldator|weller|hakko|\bfiltro per tubo\b/i, 'ricambi_saldatura'],
  [/\bguanti\b|\bscarp[ae]\b|\bzoccol|\bpolo\b|\bt-shirt\b|\bcamice\b|\bindumenti\b|\bmascherin|\btappi auricolari\b|\bdpi\b/i, 'dpi'],
  [/\bimball|\bscatol[aei]\b|\bcarton[ei]\b|\bbusta\b|\bbuste\b|pluriboll|\bpianetto\b|film estensibile|\bconai\b|\bpallet\b/i, 'imballaggio'],
  [/\bkapton\b|\besd\b|antistatic|\btape extender\b|\bnastro\b|\bbollini\b|\betichette\b|\bo-ring\b|\bviti?\b|\bvite\b/i, 'nastri_esd'],
  [/\bpedagg|\btelepass\b|\bcarburante\b|\btagliando\b|\bpneumatic|\bgomme\b|\bautoveicol|\bautovettura\b|\bauto\b.*\b(lavaggio|olio|freni)\b|\bwall connector\b/i, 'auto'],
  [/\baudit\b|consulenza (tecnica|portale|informatica|organizzativa)|\bportale\b|\bplugin\b|\bsito (aziendale|web)\b|change management/i, 'consulenze_tecniche'],
  [/\bcedolin|\bpaghe\b|\bf24\b|\bcommercialist|\bcontabilit|assistenza prestata|assist prestata|\bnotai|\bincarico annuale\b|\brspp\b|\bprivacy\b|\bgdpr\b/i, 'consulenze_amministrative'],
  [/\bteleallarme\b|\bvigilanza\b|\bsorveglianza\b|\bantincendio\b|\bcorso (di formazione|antincendio|primo soccorso|rspp|sicurezza|aggiornamento)|\bcorsi\b|\bformazione\b|\bvisita medica\b|\bspirometria\b|\bispesl\b|\bverifiche? (periodic|impiant)|\bmedico\b|\bvmc\b/i, 'sicurezza'],
  [/\bmontaggio\b|\bassemblaggio\b|\bmontaggi\b|lavorazione conto terzi|\bcollaudo esterno\b/i, 'montaggi_esterni'],
  [/ricerca e sviluppo|\br&d\b|\bsal\b.*progetto/i, 'ricerca_sviluppo'],
  [/\bprogettazione\b|\bprototip|\bsviluppo (scheda|firmware|software|pcb)\b|\blayout\b/i, 'progettazione'],
  [/\benergia (fascia|attiva|reattiva)\b|\bspesa per l'energia\b|oneri (generali )?di sistema|rete elettrica|\bkwh\b|fornitura (di )?energia/i, 'energia'],
  [/\bgas\b|\bmetano\b|\bacquedotto\b|\bacqua\b.*\bquota\b|\bfognatura\b|\bdepurazione\b|\bcng\b/i, 'gas_acqua'],
  [/ultra fibra|\bfibra\b.*\bbusiness\b|\btelefon|\bvoip\b|\bconnettività\b|\binternet\b/i, 'telefonia'],
  [/\bworkspace\b|microsoft 365|\boffice 365\b|\bhosting\b|\bdominio\b|\blicenz[ae]\b|\babbonamento\b|\bsubscription\b|\bchatgpt\b|\bbackup\b|\bssl\b|\bcasella\b|fatturazione elettronica|\bcloud\b|\bmonthly fees\b/i, 'software'],
  [/\bmanutenzione\b|\bricambi\b|\bparti ricambio\b|\bsostituzione\b|intervento tecnico|\briparazione\b|\bcuscinett|\bspare ?part\b|\briavvolto\b/i, 'manutenzioni'],
  [/\bfresatrice\b|\bstampante 3d\b|3d printer|\bmacchina\b|\battrezzatura\b|\bforno\b|\bmicroscopio\b|\bcompressore\b|\bbanco\b|\bfeeder\b/i, 'attrezzature'],
  [/\bmenu\b|\bpranzo\b|\bcena\b|\bcoperto\b|distributori automatici|\bboccion|\bcaff[eè]\b|\bprosciutto\b|\bparmig/i, 'mensa'],
  [/pulizie ordinarie|\bpulizia\b.*\bsede\b|carta igienica|\bsapone\b|\bmop\b|\bsacchi\b|\brotol[oi] carta\b|\bcarta asciug/i, 'pulizie'],
  [/\bcontatti\b|\bappuntament|\bpubblicit|\bfiera\b|\bcatalogo\b|\bbiglietti da visita\b/i, 'commerciale'],
  [/\bassicurazion[ei]\b|\bpolizza\b|costi assicurativi/i, 'assicurazioni'],
  [/\btoner\b|\bcartucc|\bcarta (a4|da stampa)\b|\brisma\b|\bcancelleria\b|\bpenn[ae]\b|\bmultipresa\b|\bventilatore\b|\blavastoviglie\b|\bhard disk\b|\bssd\b|\bram\b|\bmonitor\b|\bscanner\b|\bmini pc\b|\bdesktop\b/i, 'ufficio'],
  [/\bspese? (di )?(trasporto|spedizione)\b|\bcosti di spedizione\b|\bfreight\b|\bshipping\b|\btrasporto\b|\bnolo\b|\bcorriere\b|\bexpress\b|\britiro\b|supplemento carburante|\bdiritto fisso\b/i, 'trasporti'],
  [/\bpcb\b|printed circuit|circuito stampato|\bcircuiti stampati\b|\bmultilayer\b|\benig\b|\bhasl\b/i, 'pcb'],
];

/**
 * Fornitori abituali: categoria se le parole non decidono. Nomi in minuscolo, basta un pezzo del nome.
 * Un fornitore nuovo importante si aggiunge qui; gli altri finiscono "da verificare".
 */
const FORNITORI: [RegExp, string, boolean?][] = [
  // materiale rivenduto
  [/\btme\b|mouser|digi-?key|farnell|arrow electronics|w[uü]e?rth elektronik|redtide|cbs europe|pc components|i\.?c\.? blue|samtec|lemo|steliau|rs components|camel geco|d\.s\.e\.|rebix|gse srl|idc\b|ics industrial|mc' ?tronic|celte|startec|pietrobelli|el\.co\. elettronica|fast elettronica|fgl srl|tecnosens|conrad|electronic center|prod\.el|albe innovation|accumulatori gidi|batter fly|keers|fuocofreddo|wuerth s\.r\.l|w[uü]rth s\.r\.l|italfit magneti|cofermetal|allied international/, 'componenti'],
  [/hts pcb|ncab|serigroup|p\.a\.c\. di bezzetto|laura nardi/, 'pcb'],
  [/tecnolab|lopar/, 'lamine'],
  [/mikecompositi|b\.m\.p\. srl|bimetal|ma\.ba\b|filippi e moletti|nuova caser/, 'meccanica'],
  // consumo
  [/i-tronik/, 'stagno'],
  [/piergiacomi|girelli alcool|gea srl|emmevi|aiesi|3efarma/, 'chimici'],
  [/barbieri srl|e\.o\.i\. tecne/, 'ricambi_saldatura'],
  [/el\.mi srl|townx|a-z rappresentanza/, 'nastri_esd'],
  [/imbalpoint|scatolificio|bleker|effenne/, 'imballaggio'],
  [/pigreco|ok italy|wetec/, 'dpi'],
  // lavorazioni
  [/maria settegrani/, 'montaggi_esterni'],
  [/innuvatech/, 'ricerca_sviluppo'],
  [/cetani|andrea bodria|noamweb/, 'consulenze_tecniche'],
  // gestione
  [/immobilzeta/, 'affitto'],
  [/sardaleasing|leasing/, 'leasing'],
  [/enel energia|a2a energia|yada energia|pad multienergy/, 'energia'],
  [/eni plenitude|iren acqua|ireti|socogas|metano|b petrol|petrol point|sulis monica|boschi pietro|servizi e gestioni italia|steal s\.r\.l|virginio alberti|singh jagdeep|luca mattiazzi/, 'gas_acqua'],
  [/ste\.al\.tech|essegi|fainardi|sopran|cabiotec/, 'manutenzioni'],
  [/elettronica servizi jox/, 'attrezzature'],
  [/guglielmetti|u\.p\.a\.|federimpresa|studio notarile|marco granata|iubenda|umana spa|for\.p\.in/, 'consulenze_amministrative'],
  [/metronotte|mete srl|giava servizi|antincendio|vega formazione|teco srl|istituto nazionale previdenza|alis societ/, 'sicurezza'],
  [/fedex|brt s\.p\.a|dhl|united parcel|gls enterprise|yuhang/, 'trasporti'],
  [/programma auto|autostrade|telepass|calestani gomme|tesla italy|metanauto|metano auto|daniele cattoni/, 'auto'],
  [/dimensione s\.?r\.?l/, 'telefonia'],
  [/google cloud|microsoft|ovh|aruba|teamsystem|madbit|openai|computer\.milano/, 'software'],
  [/amazon|shopty|star tech|a2zworld|tancredi|zayron|shijie|shenzhen|jiniss|peng wutao|diamond bfg|vm group|megaditta|ferramenta|eurocali|futural|b & w handels|sp\. z o\.o|b\.f\.m\.|bastante salvatore|creality|b\.s\. macchine/, 'ufficio', true],
  [/emmegieffe|kimicart|pro-tec|refial|s\.g\.s\.|md s\.p\.a/, 'pulizie'],
  [/orasesta|ristorante|peracchi|robu petru|ninety s|salumificio/, 'mensa'],
  [/itacall/, 'commerciale'],
];

/** Con un fornitore noto e specializzato solo queste parole cambiano categoria: "nastro" in una riga di componenti o "trasporto" in una bolletta non contano. */
const CATEGORIE_FORTI = new Set(['imposte', 'banca', 'dogane', 'leasing', 'affitto', 'lamine', 'stagno', 'chimici', 'ricambi_saldatura', 'manutenzioni', 'attrezzature', 'assicurazioni']);
/** Parole che valgono solo senza un fornitore noto: "montaggio" lo scrivono anche il gommista e il negozio online. */
const CATEGORIE_DEBOLI = new Set(['montaggi_esterni', 'progettazione']);

const ACCESSORIA = /\bspese? (di )?(trasporto|spedizione|imballo|gestione ordine)\b|\bcosti di spedizione\b|\bfreight\b|\bshipping\b|contributo spese|spese imballo|\bfx rate\b|\bbollo\b/i;

/** Righe senza valore (riferimenti a DDT e ordini, righe ausiliarie): non si classificano. */
export const rigaDaIgnorare = (r: RigaDaClassificare) =>
  (r.importo != null && r.importo === 0) || /^(rif\.?|riferimento|ddt|d\.d\.t\.|riga ausiliaria|contat\.|assolve agli obblighi|acknowledgement)/i.test(r.descrizione.trim());

/** La categoria di una riga: parole della descrizione, poi fornitore; "nessuna" = da verificare (resta in Altre spese finché non si decide). */
export function classificaRiga(r: RigaDaClassificare): Esito {
  const d = r.descrizione ?? '';
  const f = (r.fornitore ?? '').toLowerCase();
  const regola = FORNITORI.find(([re]) => re.test(f));
  const fornitore = regola?.[1], generico = !!regola?.[2];   // generico = negozio che vende di tutto (Amazon): decidono le parole
  // spese accessorie (trasporto, imballo, bollo) di un fornitore di materiale: restano nella categoria del fornitore
  if (fornitore && ACCESSORIA.test(d)) return { categoria: fornitore, macro: categoria(fornitore).macro, come: 'fornitore', accessoria: true };
  const parola = PAROLE.find(([re]) => re.test(d))?.[1];
  const vale = parola && (!fornitore ? true : generico ? !CATEGORIE_DEBOLI.has(parola) : CATEGORIE_FORTI.has(parola));
  if (parola && vale) return { categoria: parola, macro: categoria(parola).macro, come: 'parola' };
  if (fornitore) return { categoria: fornitore, macro: categoria(fornitore).macro, come: 'fornitore' };
  // descrizione da catalogo componenti (sigle con numeri, valori elettrici) senza fornitore noto
  if (/\b(smd|0402|0603|0805|1206|sot-?23|soic|qfn|tqfp|mlcc|x7r|x5r|npn|mosfet|schottky|resist|condensator|capacitor|diod[eo]|connettor|connector|transistor|microcontroll|led)\b/i.test(d))
    return { categoria: 'componenti', macro: 'rivendita', come: 'parola' };
  return { categoria: 'altro', macro: 'gestione', come: 'nessuna' };
}

/** Totali per macro e categoria di un elenco di righe già classificate (importi con segno: note di credito negative). */
export function riepilogoCategorie(righe: { categoria: string; importo: number }[]) {
  const perCategoria = new Map<string, number>();
  for (const r of righe) perCategoria.set(r.categoria, (perCategoria.get(r.categoria) ?? 0) + r.importo);
  const perMacro = new Map<Macro, number>();
  for (const [c, v] of perCategoria) { const m = categoria(c).macro; perMacro.set(m, (perMacro.get(m) ?? 0) + v); }
  const totale = [...perMacro.values()].reduce((s, v) => s + v, 0);
  return {
    totale: r2(totale),
    macro: (Object.keys(NOMI_MACRO) as Macro[]).map(m => ({ macro: m, nome: NOMI_MACRO[m], importo: r2(perMacro.get(m) ?? 0), quota: totale ? r2(((perMacro.get(m) ?? 0) / totale) * 100) : 0 })),
    categorie: CATEGORIE.map(c => ({ ...c, importo: r2(perCategoria.get(c.codice) ?? 0) })).filter(c => c.importo !== 0).sort((a, b) => Math.abs(b.importo) - Math.abs(a.importo)),
  };
}
const r2 = (n: number) => Math.round(n * 100) / 100;
