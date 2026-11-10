-- Adriano 10/11/2026: "PCB circuito stampato" e "PCB prototipi" sono sempre la stessa famiglia PCB: un solo codice, MC-PCB-001.
-- Prototipo / campionatura si scrive nelle note della riga. MC-PCB-003 si toglie (se è già in un ordine, la riga passa a MC-PCB-001).
UPDATE documenti_righe SET codice = 'MC-PCB-001',
  note = CASE WHEN coalesce(note, '') = '' THEN 'PROTOTIPI' ELSE 'PROTOTIPI - ' || note END
 WHERE codice = 'MC-PCB-003';
DELETE FROM materiali_consumo WHERE codice = 'MC-PCB-003';
