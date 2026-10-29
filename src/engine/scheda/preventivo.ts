/**
 * Dai documenti del cliente al preventivo (Adriano 27–28/10/2026): i numeri dell'incrocio diventano parametri del preventivo,
 * che resta "da validare" finché l'ufficio non lo controlla e lo salva. Nessun accesso al database.
 *  - SMD su un lato solo (anche se il cliente lo chiama BOTTOM): per noi è "solo TOP".
 *  - THT a onda: componenti in giostra e stagno della saldatrice a grammi (le scorie le aggiunge la formula del costo).
 *  - THT a mano: punti di saldatura = refori, filo 0,125 g a piedino.
 */
import { CONSUMI, type AnalisiScheda } from './analisi.js';

export interface VoceCompilata { codice: string; valore: number; perche: string }

const arrot = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function parametriDaAnalisi(a: AnalisiScheda): { parametri: Record<string, number>; voci: VoceCompilata[]; daControllare: string[] } {
  const c = a.conteggi, l = a.lavorazione;
  const voci: VoceCompilata[] = [];
  const metti = (codice: string, valore: number, perche: string) => voci.push({ codice, valore, perche });
  const daControllare: string[] = [];
  const smd = c.smdTop + c.smdBot;

  metti('primaProduzione', 1, 'scheda nuova: documenti del cliente');
  metti('presenteSmd', smd > 0 ? 1 : 0, smd > 0 ? `${smd} SMD` : 'nessun SMD');
  metti('doppiaFaccia', l.latiSmd === 2 ? 1 : 0, l.latiSmd === 2 ? 'SMD su tutti e due i lati' : 'SMD su un lato solo');
  if (l.latiSmd === 2) {
    metti('qtSmd', c.smdTop, 'SMD sul lato TOP');
    metti('qtFeeder', c.feederTop, 'codici SMD diversi sul TOP');
    metti('qtSmdLatoB', c.smdBot, 'SMD sul lato BOT');
    metti('qtFeederLatoB', c.feederBot, 'codici SMD diversi sul BOT');
  } else {
    const bot = l.latoSmdUnico === 'BOT';
    metti('qtSmd', smd, bot ? 'SMD tutti sul lato che il cliente chiama BOTTOM: per noi lato unico' : 'SMD sul lato TOP');
    metti('qtFeeder', bot ? c.feederBot : c.feederTop, 'codici SMD diversi');
    metti('qtSmdLatoB', 0, 'lato unico');
    metti('qtFeederLatoB', 0, 'lato unico');
  }
  // AOI sui lati con SMD (il lato unico è il nostro TOP); il controllo visivo lo sceglie l'ufficio
  metti('aoiTop', smd > 0 ? 1 : 0, smd > 0 ? 'ispezione AOI del lato con SMD' : 'nessun SMD');
  metti('aoiBot', l.latiSmd === 2 ? 1 : 0, l.latiSmd === 2 ? 'ispezione AOI anche del BOT' : 'lato unico');
  metti('controlloVisivo', 0, 'con SMD si usa l\'AOI');
  if (smd > 0) {
    metti('acquistoLamina', 1, 'una lamina per ogni lato con SMD');
    metti('nLamine', l.latiSmd, l.latiSmd === 2 ? 'TOP e BOT' : 'un lato');
    metti('crema', arrot(a.consumi.pastaGrammi), `${CONSUMI.pastaGrammi} g ogni ${CONSUMI.pastaOgniComponenti} componenti`);
    daControllare.push('lamine: se le fornisce il cliente togliere la spunta');
  }

  metti('usaOnda', l.saldaturaTht === 'onda' ? 1 : 0, l.saldaturaTht === 'onda' ? l.motivo : 'niente saldatura a onda');
  metti('presenteTht', l.saldaturaTht === 'mano' ? 1 : 0, l.saldaturaTht === 'mano' ? l.motivo : 'niente saldatura a mano');
  if (c.tht > 0) {
    metti('qtTht', c.tht, 'componenti THT');
    metti('qtTipolTht', c.codiciTht, 'codici THT diversi');
    daControllare.push('THT da preparare (piegatura/taglio) e casi particolari onda/mano: li decide l\'ufficio');
    const refori = c.refori ?? 0;
    if (c.refori == null) daControllare.push('refori non contati (mancano CAD e forature): stagno da scrivere a mano');
    if (l.saldaturaTht === 'onda') {
      metti('qntCompMontaggio', c.tht, 'THT montati in giostra prima dell\'onda');
      metti('stagnoPerSaldature', arrot(refori * CONSUMI.ondaGrammiForo), `${refori} refori × ${CONSUMI.ondaGrammiForo} g (le scorie le aggiunge il calcolo)`);
      metti('stagno', 0, 'stagno scritto in grammi');
      if (a.segnalazioni.some(s => /onda/i.test(s.testo) && s.livello !== 'info' && !s.accettata)) daControllare.push('segnalazioni sulla saldatura a onda');
    } else if (l.saldaturaTht === 'mano') {
      metti('qntPuntiSaldaturaMano', refori, `${refori} refori`);
      metti('stagnoInFilo', arrot(refori * CONSUMI.filoGrammiPiedino), `${refori} piedini × ${CONSUMI.filoGrammiPiedino} g`);
    }
  }
  metti('nItemMateriale', c.item, `${c.item - 1} codici montati + PCB`);
  const errori = a.segnalazioni.filter(s => s.livello === 'errore' && !s.accettata).length;
  if (errori) daControllare.unshift(`${errori} segnalazioni da chiarire con il cliente (vedi i documenti)`);
  return { parametri: Object.fromEntries(voci.map(v => [v.codice, v.valore])), voci, daControllare };
}

/**
 * Cicli di lavorazione scritti dal cliente nella mail (Adriano 29/10/2026, RDO Elemaster): accendono le spunte che hanno una voce
 * nel preventivo (onda, saldatura a mano, AOI, etichette, pulizia, lavaggio); le altre lavorazioni (preformatura, colla, cablaggi,
 * parti meccaniche, rasatura, verniciatura, collaudo…) finiscono in "Da controllare" perché il tempo lo stima l'ufficio.
 * Le serigrafie, i montaggi SMD, le rifusioni e le ispezioni visive sono già nel preventivo standard e non cambiano niente.
 */
export function parametriDaCicli(cicli: string[]): { parametri: Record<string, number>; voci: VoceCompilata[]; daControllare: string[] } {
  const voci: VoceCompilata[] = [];
  const altre: string[] = [];
  const metti = (codice: string, valore: number, perche: string) => { if (!voci.some(v => v.codice === codice)) voci.push({ codice, valore, perche }); };
  for (const grezzo of cicli) {
    const c = grezzo.toUpperCase();
    const breve = grezzo.replace(/\s*-+>.*$/, '').trim();
    const perche = `ciclo del cliente «${breve}»`;
    if (/\bONDA\b/.test(c) && /SALD/.test(c) && !/INSERIM/.test(c)) metti('usaOnda', 1, perche);
    else if (/MANUAL/.test(c) && /SALD/.test(c) && !/ONDA/.test(c)) metti('presenteTht', 1, perche);
    else if (/\bAOI\b/.test(c)) metti('aoiTop', 1, perche);
    else if (/ETICHET/.test(c)) metti('etichette', 1, perche);
    else if (/LAVAGG/.test(c)) metti('lavaggioSchede', 1, perche);
    else if (/PULIZIA/.test(c)) metti('puliziaSaldature', 1, perche);
    else if (/SERIG|MONT\.? ?AUTOM|RIFUSIONE|ISP\.? ?VISIVA|INSERIM/.test(c)) continue;
    else altre.push(breve);
  }
  const daControllare = altre.length ? [`lavorazioni chieste dal cliente da stimare a mano: ${altre.join(', ')}`] : [];
  if (voci.some(v => v.codice === 'presenteTht')) daControllare.push('saldatura THT a mano chiesta dal cliente: scrivere i punti di saldatura a mano');
  return { parametri: Object.fromEntries(voci.map(v => [v.codice, v.valore])), voci, daControllare };
}
