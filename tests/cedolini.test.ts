import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiCedolini, unisciCedolini, cedoliniValidi, chiaveCedolino, totaliCedolini, mensilitaDa } from '../src/engine/cedolini.js';

// Nomi, codici fiscali e importi INVENTATI: le buste paga vere non vanno mai nel repository.

/** Riga con le colonne allineate come pdftotext -layout: [colonna di inizio, testo] oppure [-colonna di fine, testo]. */
function riga(...parti: [number, string][]): string {
  let s = '';
  for (const [col, t] of parti) {
    const inizio = col < 0 ? -col - t.length : col;
    s = s.padEnd(inizio) + t;
  }
  return s;
}
const RIT = 150, COMP = 175; // fine delle colonne RITENUTE e COMPETENZE

function paginaUpa(o: { matricola: string; nome: string; cf: string; periodo: string; voci: [string, string, 'r' | 'c' | 'i', string][]; ritenute: string; competenze: string; netto: string; continua?: boolean }) {
  return [
    riga([23, 'Elaborato da :U.P.A. - FEDERIMPRESA - PIACENZA']),
    riga([24, 'MATRICOLA / COD. MECC.'], [90, 'DIPENDENTE']),
    riga([23, `00000000${o.matricola}\\`], [40, o.matricola], [50, o.nome]),
    riga([24, 'QUALIFICA'], [80, 'MANSIONE - LIVELLO']),
    riga([33, 'OPERAIO - ADDETTO MONTAGGIO - 3'], [120, '3 - 12345678/90']),
    riga([24, 'DATA NASCITA'], [55, 'DATA ASSUNZIONE'], [80, 'DATA CESSAZIONE'], [110, 'CODICE FISCALE']),
    riga([36, '01/02/1990'], [60, '1/03/2022'], [110, o.cf], [140, '01 - Operai']),
    riga([24, 'DATA EMISSIONE'], [50, 'PERIODO PAGA'], [90, 'ORE LAV.'], [110, 'GG. LAV.']),
    riga([33, '9/09/2026'], [50, o.periodo], [95, '160,00'], [112, '20'], [126, '26']),
    riga([33, 'RETRIBUZIONE BASE'], [60, ':'], [70, '1.800,00']),
    riga([33, 'Paga oraria'], [60, ':'], [70, '10,40462'], [95, 'Paga giorn.'], [115, ':'], [120, '69,23077'], [135, 'Totale'], [150, ':'], [-170, '1.800,00']),
    riga([31, 'COD.'], [55, 'DESCRIZIONE'], [100, 'ORE / GG'], [120, '%'], [130, 'DATO BASE'], [-RIT, 'RITENUTE'], [-COMP, 'COMPETENZE']),
    ...o.voci.map(([cod, descr, tipo, imp]) => riga([33, cod], [43, descr], [tipo === 'i' ? -140 : tipo === 'r' ? -RIT : -COMP, imp])),
    riga([43, 'Tot. rit. sociali'], [-140, '165,42']),
    o.continua ? riga([150, 'Continua su foglio numero']) : '',
    riga([8, 'Firma e data']),
    riga([24, 'NOTE'], [138, 'TOTALE RITENUTE'], [160, 'TOTALE COMPETENZE']),
    riga([-RIT, o.ritenute], [-COMP, o.competenze]),
    riga([138, 'NETTO IN BUSTA']),
    riga([110, 'ARR. PRECEDENTE'], [135, 'ARR. ATTUALE']),
    riga([60, 'Prossimo scatto'], [-COMP, o.netto]),
    riga([60, '1/03/2028'], [-125, '0,25'], [-145, '0,12']),
  ].join('\n');
}

test('cedolino U.P.A.: persona, periodo, totali, netto e voci divise tra competenze e ritenute', () => {
  const testo = paginaUpa({
    matricola: '7', nome: 'ROSSI MARIO', cf: 'RSSMRA90B01G535X', periodo: '08/2026 - Agosto',
    voci: [['2', 'COMPETENZE MESE', 'c', '1.800,00'], ['113', 'STRAORDINARIO 25%', 'c', '130,00'], ['1', 'CONTRIBUTO FAP', 'r', '177,37'],
      ['999', 'TOT. LORDO SOGG.CTR', 'i', '1.930,00'], ['', 'Rit. Fis. mese netta', 'r', '210,10'], ['', 'Add.Reg. rata pagata (Cod.: EM )', 'r', '20,00']],
    ritenute: '407,47', competenze: '1.930,00', netto: '1.522,00',
  });
  const [c] = leggiCedolini(testo, 'Casteltech - ced 08-2026.pdf');
  assert.equal(c.modello, 'upa');
  assert.equal(c.nome, 'ROSSI MARIO');
  assert.equal(c.matricola, '7');
  assert.equal(c.codice_fiscale, 'RSSMRA90B01G535X');
  assert.equal(c.anno, 2026); assert.equal(c.mese, 8); assert.equal(c.mensilita, 'ordinaria');
  assert.equal(c.qualifica, 'OPERAIO');
  assert.equal(c.data_assunzione, '2022-03-01');
  assert.equal(c.ore_lavorate, 160); assert.equal(c.giorni_lavorati, 20);
  assert.equal(c.paga_oraria, 10.40462); assert.equal(c.retribuzione, 1800);
  assert.equal(c.lordo, 1930); assert.equal(c.ritenute, 407.47);
  assert.equal(c.netto, 1522, 'netto stampato, non competenze − ritenute (arrotondamenti)');
  assert.equal(c.contributi_dipendente, 165.42);
  assert.equal(c.irpef, 210.1); assert.equal(c.addizionali, 20);
  assert.deepEqual(c.voci.filter(v => v.tipo === 'competenza').map(v => v.codice), ['2', '113']);
  assert.deepEqual(c.voci.filter(v => v.tipo === 'ritenuta').map(v => v.importo), [177.37, 210.1, 20]);
  assert.deepEqual(c.avvisi, [], 'voci e totali tornano');
});

test('tirocinante senza ritenute: il solo totale va tra le competenze', () => {
  const t = paginaUpa({ matricola: '300', nome: 'BIANCHI LUCA', cf: 'BNCLCU02A01G535X', periodo: '02/2026 - Febbraio',
    voci: [['483', 'TIROCINANTE', 'c', '450,00']], ritenute: '', competenze: '450,00', netto: '450,00' });
  const [c] = leggiCedolini(t);
  assert.equal(c.lordo, 450); assert.equal(c.ritenute, 0); assert.equal(c.netto, 450);
});

test('tredicesima riconosciuta dal periodo; cedolino su due pagine = uno solo con i totali dell\'ultima', () => {
  const tred = paginaUpa({ matricola: '7', nome: 'ROSSI MARIO', cf: 'RSSMRA90B01G535X', periodo: '12/2026 - TREDICESIMA',
    voci: [['70', 'TREDICESIMA', 'c', '1.800,00']], ritenute: '300,00', competenze: '1.800,00', netto: '1.500,00' });
  assert.equal(leggiCedolini(tred)[0].mensilita, 'tredicesima');
  const p1 = paginaUpa({ matricola: '8', nome: 'VERDI ANNA', cf: 'VRDNNA85C41G535X', periodo: '07/2026 - Luglio',
    voci: [['2', 'COMPETENZE MESE', 'c', '1.500,00']], ritenute: '100,00', competenze: '1.500,00', netto: '', continua: true });
  const p2 = paginaUpa({ matricola: '8', nome: 'VERDI ANNA', cf: 'VRDNNA85C41G535X', periodo: '07/2026 - Luglio',
    voci: [['45', 'FERIE NON GODUTE', 'c', '500,00'], ['', 'Rit.Fis. conguaglio', 'r', '250,00']], ritenute: '350,00', competenze: '2.000,00', netto: '1.650,00' });
  const cc = leggiCedolini(`${p1}\f${p2}`);
  assert.equal(cc.length, 1);
  assert.equal(cc[0].lordo, 2000); assert.equal(cc[0].netto, 1650);
  assert.equal(cc[0].voci.length, 3);
  assert.deepEqual(cc[0].avvisi.filter(a => /voci di competenza/.test(a)), []);
});

test('modello dello studio precedente (2019–2021): intestazioni con la "s" al posto degli spazi', () => {
  const testo = [
    riga([118, 'TipoCosto :'], [210, 'Maggio 2021']),
    riga([122, 'Codicesdipendente'], [165, 'COGNOMEsEsNOME'], [250, 'CodicesFiscale']),
    riga([118, '0000003'], [165, 'NERI GIULIA'], [250, 'NREGLI00A41G535X']),
    riga([123, 'DatasdisNascita'], [150, 'DatasAssunzione'], [170, 'DatasCessazione']),
    riga([200, 'AOP'], [250, 'Gr.2 Ap.Pr.']),
    riga([122, '20-01-2000'], [150, '01-10-2019']),
    riga([122, 'Settimane'], [140, 'Giorni'], [152, 'Ore'], [160, 'Giorni'], [170, 'Ore'], [180, 'Giorni'], [192, 'Ore ordinarie'], [215, 'Ore straordinarie']),
    riga([125, '5'], [145, '23'], [164, '23'], [182, '18'], [193, '144,00'], [220, '3,00']),
    riga([180, 'VOCIsVARIABILIsDELsMESE'], [270, 'IMPORTOsBASE'], [300, 'RIFERIMENTO'], [-340, 'TRATTENUTE'], [-370, 'COMPETENZE']),
    riga([118, '* * Z00001 Retribuzione'], [270, '6,46818'], [300, '144,00000 ORE'], [-370, '931,42']),
    riga([122, 'ZP9960 Arrotond. mese pr.'], [-340, '0,76']),
    riga([126, '000061 Contributo Sanarti'], [290, 'C/Ditta'], [355, '('], [-370, '10,42 )']),
    riga([118, '*       Z00000 Contributo IVS'], [270, '999,00'], [300, '5,84000 %'], [-340, '58,34']),
    riga([126, 'F03020 Ritenute IRPEF'], [-340, '95,72']),
    riga([118, 'CONGUAGLIO']),
    riga([300, 'TOTALEsCOMPETENZE'], [-370, '931,42']),
    riga([300, 'TOTALEsTRATTENUTE'], [-370, '154,82']),
    riga([300, 'ARROTONDAMENTO'], [-370, '0,40']),
    riga([310, 'NETTOsDELsMESE']),
    riga([320, 'Perm.P.A.R'], [340, '10,35500']),
    riga([-370, '777,00 €']),
  ].join('\n');
  const [c] = leggiCedolini(testo, '2021/05.MAGGIO.pdf');
  assert.equal(c.modello, 'zucchetti');
  assert.equal(c.nome, 'NERI GIULIA'); assert.equal(c.matricola, '3');
  assert.equal(c.anno, 2021); assert.equal(c.mese, 5);
  assert.equal(c.data_assunzione, '2019-10-01');
  assert.equal(c.qualifica, 'APPRENDISTA');
  assert.equal(c.ore_lavorate, 144);
  assert.equal(c.lordo, 931.42); assert.equal(c.ritenute, 154.82); assert.equal(c.netto, 777);
  assert.equal(c.contributi_dipendente, 58.34); assert.equal(c.irpef, 95.72);
  assert.deepEqual(c.voci.map(v => [v.codice, v.tipo]), [['Z00001', 'competenza'], ['ZP9960', 'ritenuta'], ['Z00000', 'ritenuta'], ['F03020', 'ritenuta']]);
});

test('lo stesso cedolino in più file: vale il file corretto (l\'ultimo); chiave per persona, mese e mensilità', () => {
  const base = { modello: 'upa' as const, anno: 2022, mese: 4, mensilita: 'ordinaria' as const, matricola: '1', nome: 'X Y', codice_fiscale: 'AAABBB00A01G535X',
    qualifica: null, livello: null, mansione: null, data_assunzione: null, data_cessazione: null, ore_lavorate: null, giorni_lavorati: null, paga_oraria: null,
    retribuzione: null, ritenute: 0, contributi_dipendente: null, irpef: null, addizionali: null, voci: [], avvisi: [] };
  const u = unisciCedolini([{ nome: 'aprile.pdf', cedolini: [{ ...base, lordo: 100, netto: 100 }] }, { nome: 'aprile corretto.pdf', cedolini: [{ ...base, lordo: 120, netto: 120 }] }]);
  assert.equal(u.length, 1); assert.equal(u[0].lordo, 120); assert.equal(u[0].file, 'aprile corretto.pdf');
  assert.equal(chiaveCedolino(base), 'AAABBB00A01G535X|2022-04|ordinaria');
  assert.equal(chiaveCedolino({ ...base, codice_fiscale: null, mensilita: 'tredicesima', mese: 12 }), 'X Y|2022-12|tredicesima');
});

test('mensilità dal nome del file', () => {
  assert.equal(mensilitaDa('2019/13.TREDICESIMA DITTA.pdf'), 'tredicesima');
  assert.equal(mensilitaDa('2022/13_13.ME.pdf'), 'tredicesima');
  assert.equal(mensilitaDa('13_CASTELTECH -13ME 2024.pdf'), 'tredicesima');
  assert.equal(mensilitaDa('2020/14.DICEMBRE.pdf'), 'ordinaria');
});

test('file dello storico: solo cedolini validi, totali per anno', () => {
  const v = cedoliniValidi({ tipo: 'cedolini', cedolini: [
    { anno: 2025, mese: 3, nome: 'rossi mario', codice_fiscale: 'rssmra90b01g535x', lordo: 1000, ritenute: 200, netto: 800, ore_lavorate: 160,
      voci: [{ codice: '2', descrizione: 'X', importo: 1000, tipo: 'competenza' }, { importo: 'x', tipo: 'competenza' }] },
    { anno: 2025, mese: 13, nome: 'SBAGLIATO', lordo: 1 },
    { anno: 2025, mese: 4, lordo: 1 },
  ] });
  assert.equal(v.length, 1);
  assert.equal(v[0].nome, 'ROSSI MARIO'); assert.equal(v[0].codice_fiscale, 'RSSMRA90B01G535X');
  assert.equal(v[0].voci.length, 1);
  assert.deepEqual(cedoliniValidi({ tipo: 'costi', cedolini: [] }), []);
  const t = totaliCedolini([v[0], { ...v[0], lordo: 500, netto: 400, ritenute: 100, ore_lavorate: null }]);
  assert.equal(t.lordo, 1500); assert.equal(t.netto, 1200); assert.equal(t.ore, 160); assert.equal(t.cedolini, 2);
});

test('qualifica dello studio precedente con le parole di oggi', async () => {
  const { qualificaZucchetti } = await import('../src/engine/cedolini.js');
  assert.equal(qualificaZucchetti("OPE 5' Livello"), 'OPERAIO');
  assert.equal(qualificaZucchetti("IMP 5' Livello"), 'IMPIEGATO');
  assert.equal(qualificaZucchetti('AOP Gr.2 Appr.Prof. No tit. Liv.5 Ap.profes.'), 'APPRENDISTA');
  assert.equal(qualificaZucchetti('Co.Co.Co'), 'COLLABORATORE');
  assert.equal(qualificaZucchetti('Tir./Stag. T.Determinato'), 'TIROCINANTE');
  assert.equal(qualificaZucchetti(null), null);
});

test('la guida spiega dove si vedono le buste paga come dati', async () => {
  const { cercaGuida } = await import('../src/engine/guida.js');
  assert.ok(cercaGuida('buste paga netto persona').slice(0, 3).some(r => r.argomento.id === 'dipendenti'));
});
