-- Adriano, 25/10/2026:
--  * numerazione delle fasi progressiva (1, 2, 3… nell'ordine della scheda), tranne pre-produzione (lettere)
--    e gestione materiale (M1…), che restano come sono;
--  * le segnalazioni scritte nella commessa vanno nello storico del prodotto (stampate anche sulle prossime schede):
--    si portano lì quelle delle commesse già create.
WITH n AS (
  SELECT codice, row_number() OVER (ORDER BY ordine, numero) AS nr
  FROM fasi WHERE attiva AND gruppo NOT IN ('PRE-PRODUZIONE', 'GESTIONE MATERIALE')
)
UPDATE fasi f SET numero = n.nr::text FROM n WHERE f.codice = n.codice;

INSERT INTO segnalazioni (prodotto_id, revisione_id, commessa_id, origine, testo, rilevante_prossime, autore_id)
SELECT r.prodotto_id, c.revisione_id, c.id, 'ufficio', c.segnalazioni, true, c.creato_da
FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id
WHERE coalesce(trim(c.segnalazioni), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM segnalazioni s WHERE s.commessa_id = c.id AND s.origine = 'ufficio');
