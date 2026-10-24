-- "Stagno saldatrice in peso (gr a scheda)" diventa "Stagno saldatrice (gr a scheda)" (Adriano, 24/10/2026).
-- L'altro campo resta "Stagno saldatrice (nr. reofori a scheda)": cambia solo l'unità.
UPDATE parametri SET etichetta = 'Stagno saldatrice per scheda'
  WHERE codice = 'stagnoPerSaldature' AND etichetta = 'Stagno saldatrice in peso per scheda';
