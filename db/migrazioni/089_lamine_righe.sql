-- Adriano 11/11/2026: lamine fatturate dentro una riga che non scrive "lamina" (costi una tantum, pacchetto).
-- documenti_righe.lamine = quante lamine contiene la riga, segnato a mano in Analisi → Costi per categoria (NULL = decide la descrizione).
ALTER TABLE documenti_righe ADD COLUMN IF NOT EXISTS lamine smallint;

-- Righe già note (file "Lamine" di Adriano, 2026): Idea FT 74 (SL_0112, SL_0103), Botisum FT 93 (Botilift, lamina nel pacchetto)
UPDATE documenti_righe r SET lamine = 1
  FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
 WHERE d.id = r.documento_id AND d.tipo = 'fattura' AND extract(year FROM d.data) = 2026 AND r.lamine IS NULL
   AND ((d.numero = 74 AND c.ragione_sociale ~* 'idea automazione' AND r.descrizione ~* '^avvio produzione sl_01(12|03)')
     OR (d.numero = 93 AND c.ragione_sociale ~* 'botisum' AND r.descrizione ~* '^botilift'));
