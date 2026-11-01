-- ── Plafond delle lettere d'intento 2026 (Adriano 1/11/2026: "aggiungilo insieme a quello di Galileo") ──
-- Importi letti dalle ricevute dell'Agenzia nella cartella Drive 1_AMMINISTRAZIONE/9_DICHIARAZIONE INTENTI:
--   LPS     prot. 26021609544759358-000006 del 16/02/2026, operazioni 2026 fino a 70.000,00 €
--   GALILEO prot. 25121712334638233-000006 del 17/12/2025, operazioni 2026 fino a 20.000,00 €
-- Si scrive il plafond solo dove è ancora vuoto (un valore messo a mano dall'ufficio resta).
-- La lettera di GALILEO si aggiunge se manca, solo se in anagrafica c'è un solo cliente con la sua P.IVA.

UPDATE dichiarazioni_intento SET plafond = 70000
 WHERE regexp_replace(protocollo, '\D', '', 'g') = '26021609544759358000006' AND plafond IS NULL;

UPDATE dichiarazioni_intento SET plafond = 20000
 WHERE regexp_replace(protocollo, '\D', '', 'g') = '25121712334638233000006' AND plafond IS NULL;

INSERT INTO dichiarazioni_intento (cliente_id, protocollo, data_protocollo, anno, plafond, note)
SELECT c.id, '25121712334638233-000006', DATE '2025-12-17', 2026, 20000, 'Dalla ricevuta dell''Agenzia nel Drive (1/11/2026)'
  FROM clienti c
 WHERE regexp_replace(coalesce(c.partita_iva, ''), '\D', '', 'g') = '01799760358'
   AND (SELECT count(*) FROM clienti x WHERE regexp_replace(coalesce(x.partita_iva, ''), '\D', '', 'g') = '01799760358') = 1
   AND NOT EXISTS (SELECT 1 FROM dichiarazioni_intento d WHERE regexp_replace(d.protocollo, '\D', '', 'g') = '25121712334638233000006');
