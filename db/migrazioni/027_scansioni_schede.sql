-- ── Schede di produzione scansionate tra i file da acquisire ──
-- Nella cartella Drive (o caricate a mano) possono arrivare anche le schede di produzione compilate:
-- l'IA legge i fogli tempi e le righe si propongono nel rientro della commessa (l'ufficio controlla e salva).
ALTER TABLE acquisizioni DROP CONSTRAINT IF EXISTS acquisizioni_tipo_check;
ALTER TABLE acquisizioni ADD CONSTRAINT acquisizioni_tipo_check
  CHECK (tipo IN ('ordine', 'email', 'export_ordini', 'export_ddt', 'export_fatture', 'scheda_produzione', 'altro'));
