-- Articoli standard degli ordini a fornitore (Adriano 10/11/2026): "scrivendo pcb nella descrizione voglio la riga della PCB in anagrafica
-- con il nostro codice". Ricavati dagli ordini a fornitore 2026 di Fatture in Cloud (HTS PCB, LOPAR, NCAB, FOR-TEK, JOX, MASCHERPA, PIGRECO).
-- Un codice nostro per tipo di articolo; il prodotto del cliente, la revisione e le specifiche si scrivono nelle note della riga dell'ordine.
INSERT INTO materiali_consumo (codice, categoria, um, descrizione) VALUES
  ('MC-PCB-001', 'PCB', 'PZ', 'PCB CIRCUITO STAMPATO'),
  ('MC-PCB-002', 'PCB', 'PZ', 'ATTREZZATURA PCB UNA TANTUM (TEST ELETTRICO / ATTREZZAGGIO)'),
  ('MC-PCB-003', 'PCB', 'PZ', 'PCB PROTOTIPI / CAMPIONATURA'),
  ('MC-COA-007', 'COA', 'PZ', 'CONFORMAL COATING DOWSIL 1-2577 - BARATTOLO 0,5 KG (MASCHERPA 2411257705)'),
  ('MC-COA-008', 'COA', 'PZ', 'DILUENTE DOWSIL OS-20 - BOTTIGLIA 500 ML (MASCHERPA 2412000385)'),
  ('MC-ESD-007', 'ESD', 'PZ', 'SCARPE ESD (PIGRECO)')
ON CONFLICT (codice) DO NOTHING;
