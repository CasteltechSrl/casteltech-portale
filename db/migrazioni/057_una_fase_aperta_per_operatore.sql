-- Reparto da telefono: un operatore non può avere la stessa fase della stessa commessa aperta due volte
-- (doppio tocco su "Apri il tempo"). Se nei dati ci fossero già doppioni, resta solo l'apertura più vecchia.
DELETE FROM rilevazioni r USING rilevazioni r2
  WHERE r.commessa_id = r2.commessa_id AND r.fase_codice = r2.fase_codice AND r.operatore_nome = r2.operatore_nome
    AND r.aperta_il IS NOT NULL AND r.chiusa_il IS NULL AND r2.aperta_il IS NOT NULL AND r2.chiusa_il IS NULL AND r.id > r2.id;
CREATE UNIQUE INDEX IF NOT EXISTS rilevazioni_una_aperta_per_fase
  ON rilevazioni (commessa_id, fase_codice, operatore_nome) WHERE aperta_il IS NOT NULL AND chiusa_il IS NULL;
