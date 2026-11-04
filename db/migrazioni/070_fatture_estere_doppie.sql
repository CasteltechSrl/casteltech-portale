-- Fatture estere caricate due volte (Adriano 4/11/2026: Mouser n. 93214557 del 24/10/2026 arrivata come PDF e poi come email .eml).
-- Quelle ancora da controllare che ripetono una fattura già caricata prima (stesso fornitore, numero e data) si scartano:
-- resta la prima. Le autofatture già preparate non si toccano. Da qui in avanti lo fa il portale al caricamento.
UPDATE acquisizioni a
SET stato = 'scartato', contenuto = NULL,
    errore = 'doppione: la fattura n. ' || (a.proposta->>'numero') || ' è già stata caricata (file ' || b.nome_file || ')'
FROM acquisizioni b
WHERE a.tipo = 'fattura_estera' AND a.stato IN ('nuovo', 'da_confermare', 'errore')
  AND b.tipo = 'fattura_estera' AND b.stato <> 'scartato' AND b.id < a.id
  AND coalesce(a.proposta->>'data', '') <> '' AND a.proposta->>'data' = b.proposta->>'data'
  AND regexp_replace(upper(coalesce(a.proposta->>'numero', '')), '[^A-Z0-9]', '', 'g') <> ''
  AND regexp_replace(upper(a.proposta->>'numero'), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(coalesce(b.proposta->>'numero', '')), '[^A-Z0-9]', '', 'g')
  AND split_part(regexp_replace(upper(coalesce(a.proposta->'fornitore'->>'ragione_sociale', '')), '[^A-Z0-9 ]', '', 'g'), ' ', 1) <> ''
  AND split_part(regexp_replace(upper(a.proposta->'fornitore'->>'ragione_sociale'), '[^A-Z0-9 ]', '', 'g'), ' ', 1)
    = split_part(regexp_replace(upper(coalesce(b.proposta->'fornitore'->>'ragione_sociale', '')), '[^A-Z0-9 ]', '', 'g'), ' ', 1);
