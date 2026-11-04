-- Sede operativa del cliente diversa dalla sede legale (Adriano 4/11/2026, caso ELEXES).
-- La sede legale resta in indirizzo/cap/comune/provincia/nazione; quella operativa è il luogo di destinazione proposto nei DDT.
ALTER TABLE clienti
  ADD COLUMN sede_operativa_diversa boolean NOT NULL DEFAULT false,
  ADD COLUMN sede_op_presso    text,   -- facoltativo: "C/O …", "MAIL BOXES ETC"
  ADD COLUMN sede_op_indirizzo text,
  ADD COLUMN sede_op_cap       text,
  ADD COLUMN sede_op_comune    text,
  ADD COLUMN sede_op_provincia text,
  ADD COLUMN sede_op_nazione   text NOT NULL DEFAULT 'IT',
  ADD COLUMN sede_op_note      text;   -- per la consegna: "ATT. …", "CORRIERE GLS PORTO ASSEGNATO"
