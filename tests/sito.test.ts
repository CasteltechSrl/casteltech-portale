import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leggiContatto, leggiPreventivo, nomeFileSicuro, nomePacchettoSito, origineSitoAmmessa, sembraRobot, testoContatto, testoPreventivo, troppiInvii,
} from '../src/engine/sito.js';

test('sito: moduli accettati solo da casteltech.net e dall\'anteprima su Render', () => {
  assert.equal(origineSitoAmmessa('https://www.casteltech.net'), true);
  assert.equal(origineSitoAmmessa('https://casteltech.net'), true);
  assert.equal(origineSitoAmmessa('https://casteltech-sito.onrender.com'), true);
  assert.equal(origineSitoAmmessa('https://casteltech-sito-ab12.onrender.com'), true);
  assert.equal(origineSitoAmmessa('http://www.casteltech.net'), false);        // solo https
  assert.equal(origineSitoAmmessa('https://casteltech.net.truffa.com'), false);
  assert.equal(origineSitoAmmessa('https://altro.onrender.com'), false);
  assert.equal(origineSitoAmmessa(undefined), false);
});

test('sito: robot = casella trappola piena o modulo compilato in meno di 3 secondi', () => {
  const adesso = 1_800_000_000_000;
  assert.equal(sembraRobot({ aperto_il: String(adesso - 20_000) }, adesso), false);
  assert.equal(sembraRobot({ aperto_il: String(adesso - 20_000), sito_web: 'http://spam' }, adesso), true);
  assert.equal(sembraRobot({ aperto_il: String(adesso - 1_000) }, adesso), true);
  assert.equal(sembraRobot({}, adesso), true);
});

test('sito: al massimo 5 invii all\'ora dallo stesso indirizzo', () => {
  const reg = new Map<string, number[]>();
  const t = 1_800_000_000_000;
  for (let i = 0; i < 5; i++) assert.equal(troppiInvii(reg, '1.2.3.4', t + i), false);
  assert.equal(troppiInvii(reg, '1.2.3.4', t + 10), true);
  assert.equal(troppiInvii(reg, '5.6.7.8', t + 10), false);
  assert.equal(troppiInvii(reg, '1.2.3.4', t + 61 * 60 * 1000), false);   // un'ora dopo si riparte
});

test('sito: modulo Contatti con i campi del vecchio WordPress', () => {
  const { contatto, errori } = leggiContatto({
    'your-name': ' Mario ', 'your-surname': 'Rossi', 'your-email': 'Mario@Esempio.IT', 'your-subject': 'Info',
    'your-message': 'Buongiorno,\r\nvorrei un preventivo.', 'checkbox-361[]': 'Accetto',
  });
  assert.deepEqual(errori, []);
  assert.equal(contatto.email, 'mario@esempio.it');
  const { oggetto, testo } = testoContatto(contatto);
  assert.match(oggetto, /Contatto: Info/);
  assert.match(testo, /Nome: Mario Rossi/);
  assert.match(testo, /vorrei un preventivo/);
  assert.deepEqual(leggiContatto({ 'your-email': 'non-valida' }).errori, ['nome', 'email', 'messaggio', 'privacy']);
  // un a capo nell'email non deve poter aggiungere intestazioni all'email
  assert.ok(leggiContatto({ 'your-name': 'x', 'your-email': 'a@b.it\r\nBcc: c@d.it', 'your-message': 'x', privacy: '1' }).errori.includes('email'));
});

test('sito: richiesta di preventivo → testo con i soli campi compilati e nome del pacchetto', () => {
  const { richiesta, errori } = leggiPreventivo({
    company: 'Selea srl', companymail: 'tecnico@selea.it', schede: '100', 'radio-componenti': 'Fornite da Casteltech',
    componentiSMDTop: '250', 'your-note': 'Consegna a gennaio', 'checkbox-361[]': '1',
  });
  assert.deepEqual(errori, []);
  const { oggetto, testo } = testoPreventivo(richiesta, ['bom.xlsx', 'gerber.zip']);
  assert.match(oggetto, /Richiesta preventivo: Selea srl/);
  assert.match(testo, /Quantità schede: 100/);
  assert.match(testo, /Componenti SMD TOP: 250/);
  assert.doesNotMatch(testo, /BOTTOM/);
  assert.match(testo, /File allegati: bom\.xlsx, gerber\.zip/);
  assert.equal(nomePacchettoSito('Selea srl'), 'SITO – SELEA SRL');
  assert.deepEqual(leggiPreventivo({}).errori, ['azienda', 'email', 'privacy']);
});

test('sito: nomi dei file caricati senza cartelle né caratteri pericolosi', () => {
  assert.equal(nomeFileSicuro('C:\\Users\\x\\BOM finale.xlsx'), 'BOM finale.xlsx');
  assert.equal(nomeFileSicuro('../../etc/passwd'), 'passwd');
  assert.equal(nomeFileSicuro('a<b>.zip'), 'a_b_.zip');
  assert.equal(nomeFileSicuro(''), 'file');
});
