// Backup a pezzi (30/10/2026: costruito tutto in memoria faceva uscire il portale alle 20:30): src/server/backup.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('backup: stesso formato di prima, letto a blocchi, file in base64, tabelle mancanti saltate', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { testoBackup, RIGHE_PER_VOLTA } = await import('../src/server/backup.js');
  const TABELLE = ['utenti', 'clienti', 'segnalazioni', 'componenti', 'documenti'];
  const clienti = Array.from({ length: RIGHE_PER_VOLTA * 2 + 5 }, (_, i) => ({ id: i + 1, ragione_sociale: `CLIENTE "${i}"` }));
  const letture: string[] = [];
  const leggi = async (t: string, da: number, n: number) => {
    letture.push(`${t}@${da}`);
    if (t === 'clienti') return clienti.slice(da, da + n);
    if (t === 'componenti') return [{ id: 1, file: Buffer.from('ciao'), creato_il: new Date('2026-10-30T19:30:00Z') }];
    if (t === 'segnalazioni') return null;   // tabella che non c'è
    return [];
  };
  let testo = '';
  for await (const pezzo of testoBackup(TABELLE, leggi, '2026-10-30T19:30:00.000Z')) testo += pezzo;
  const b = JSON.parse(testo);
  assert.equal(b.creato_il, '2026-10-30T19:30:00.000Z');
  assert.equal(b.versione, 1);
  assert.deepEqual(b.tabelle.clienti, clienti, 'tutte le righe, in ordine, in più blocchi');
  assert.deepEqual(letture.filter(l => l.startsWith('clienti@')), ['clienti@0', `clienti@${RIGHE_PER_VOLTA}`, `clienti@${RIGHE_PER_VOLTA * 2}`]);
  assert.deepEqual(b.tabelle.componenti, [{ id: 1, file: { __bytea: Buffer.from('ciao').toString('base64') }, creato_il: '2026-10-30T19:30:00.000Z' }]);
  assert.ok(!('segnalazioni' in b.tabelle));
  assert.deepEqual(b.tabelle.utenti, []);
  assert.equal(Object.keys(b.tabelle).length, TABELLE.length - 1);
});

test('backup: tutte le tabelle, prima quelle a cui le altre rimandano', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { ordinaPerDipendenze } = await import('../src/server/backup.js');
  const ordine = ordinaPerDipendenze(['documenti_righe', 'documenti', 'clienti', 'utenti', 'ordini', 'suggerimenti'],
    [['documenti_righe', 'documenti'], ['documenti', 'clienti'], ['documenti', 'documenti'], ['ordini', 'clienti'], ['documenti', 'utenti'], ['ordini', 'tabella_esclusa']]);
  assert.deepEqual(ordine, ['clienti', 'ordini', 'suggerimenti', 'utenti', 'documenti', 'documenti_righe']);
});

test('backup: oltre lo spazio massimo si tolgono le copie più vecchie, almeno 5 restano', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { copieDaTogliere } = await import('../src/server/backup.js');
  const copie = Array.from({ length: 8 }, (_, i) => ({ nome: `casteltech-backup-2026-10-${String(20 + i).padStart(2, '0')}-20-30.json.gz`, byte: 100 }));
  assert.deepEqual(copieDaTogliere(copie, 1000), [], 'c\'è spazio');
  assert.deepEqual(copieDaTogliere(copie, 550), ['casteltech-backup-2026-10-20-20-30.json.gz', 'casteltech-backup-2026-10-21-20-30.json.gz', 'casteltech-backup-2026-10-22-20-30.json.gz']);
  assert.equal(copieDaTogliere(copie, 10).length, 3, 'le 5 più recenti restano sempre');
});
