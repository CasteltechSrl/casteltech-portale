-- Adriano 11/11/2026: in Analisi → Costi per categoria → Comprato e rivenduto,
-- JOX e Tree Solutions hanno materiale comprato da Casteltech (chiavi in mano), Control Systems è conto lavoro.
-- Scelta per cliente in impostazioni 'materiale_clienti' = { "c<id>": "nostro" | "conto_lavoro" }; si cambia dalla pagina.
INSERT INTO impostazioni (chiave, valore)
SELECT 'materiale_clienti', coalesce(jsonb_object_agg('c' || id,
         CASE WHEN ragione_sociale ~* 'control systems' THEN 'conto_lavoro' ELSE 'nostro' END), '{}'::jsonb)
  FROM clienti
 WHERE ragione_sociale ~* '^(elettronica servizi jox|tree solutions|control systems)\M'
ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore || impostazioni.valore, aggiornato_il = now();
