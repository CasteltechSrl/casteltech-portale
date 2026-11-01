// Copia dei backup sul PC dell'ufficio, cartella Google Drive (Adriano 1/11/2026): src/engine/backup-pc.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pianoCopiePc, installatoreBackupPc, NOME_BACKUP, CARTELLA_PC_PREDEFINITA } from '../src/engine/backup-pc.js';

const b = (giorno: string, ora = '19-30', extra = '') => `casteltech-backup-${giorno}-${ora}${extra}.json.gz`;
const copia = (nome: string) => ({ nome, byte: 1000 });

test('backup sul PC: la prima volta solo la copia più recente', () => {
  const p = pianoCopiePc([copia(b('2026-11-02')), copia(b('2026-11-03')), copia(b('2026-11-04'))], ['desktop.ini'], new Date('2026-11-05T10:00:00Z'));
  assert.deepEqual(p.scarica.map(c => c.nome), [b('2026-11-04')]);
  assert.deepEqual(p.togli, []);
});

test('backup sul PC: poi tutte le copie dopo l\'ultima già salvata (PC spento per giorni)', () => {
  const portale = [b('2026-11-02'), b('2026-11-03'), b('2026-11-04', '10-15', '-reset'), b('2026-11-04'), b('2026-11-05')].map(copia);
  const p = pianoCopiePc(portale, [b('2026-11-03')], new Date('2026-11-06T10:00:00Z'));
  assert.deepEqual(p.scarica.map(c => c.nome), [b('2026-11-04', '10-15', '-reset'), b('2026-11-04'), b('2026-11-05')]);
  assert.deepEqual(pianoCopiePc(portale, portale.map(c => c.nome), new Date('2026-11-06T10:00:00Z')).scarica, []);
});

test('backup sul PC: oltre 60 giorni resta solo la prima copia di ogni mese', () => {
  const locali = [b('2026-09-01'), b('2026-09-02'), b('2026-09-30'), b('2026-10-01'), b('2026-10-02'), b('2026-11-30'), 'desktop.ini', 'altro.txt'];
  const p = pianoCopiePc([], locali, new Date('2026-12-01T10:00:00Z'));   // limite: 2026-10-02
  assert.deepEqual(p.togli, [b('2026-09-02'), b('2026-09-30')]);
});

test('backup sul PC: nomi strani o con percorsi non si scaricano né si tolgono', () => {
  assert.equal(NOME_BACKUP.test('..\\..\\Windows\\casteltech-backup-2026-11-02-19-30.json.gz'), false);
  assert.equal(NOME_BACKUP.test('casteltech-backup-2026-11-02-19-30.json.gz'), true);
  const p = pianoCopiePc([copia('casteltech-backup-x/../y.json.gz')], ['..\\casteltech-backup-2020-01-02-00-00.json.gz'], new Date('2026-12-01'));
  assert.deepEqual(p, { scarica: [], togli: [] });
});

test('backup sul PC: installatore .bat in solo ASCII, con chiave, indirizzo e cartella', () => {
  const t = installatoreBackupPc({ portale: 'https://casteltech-portale.onrender.com', chiave: 'abcDEF_123-xyz' });
  assert.match(t, /^@echo off\r\n/);
  assert.ok(/^[\x00-\x7f]*$/.test(t), 'solo caratteri ASCII (il Prompt dei comandi e PowerShell 5 leggono male gli accenti)');
  assert.ok(t.includes(`$Cartella = '${CARTELLA_PC_PREDEFINITA}'`));
  assert.ok(t.includes("$Chiave = 'abcDEF_123-xyz'"));
  // il segnaposto della parte PowerShell compare una volta sola (la riga del Prompt lo compone con '#'+'POWERSHELL#')
  assert.equal(t.split('#POWERSHELL#').length, 2);
  // il programma serale è dentro con i segnaposto da riempire sul PC
  for (const x of ['$Portale = __P__', '$Chiave = __K__', '$Cartella = __C__', '/api/backup/piano', '/api/backup/file/']) assert.ok(t.includes(x), x);
  assert.ok(!/^'@/m.test(t.split("$testo = @'")[1].split("\r\n'@")[0]), 'il testo tra @\' e \'@ non chiude prima');
  // apice nella cartella raddoppiato
  assert.ok(installatoreBackupPc({ portale: 'x', chiave: 'k', cartella: "D:\\Dell'ufficio" }).includes("$Cartella = 'D:\\Dell''ufficio'"));
});
