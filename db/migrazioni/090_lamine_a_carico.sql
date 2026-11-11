-- Adriano 11/11/2026: verifica della fatturazione delle lamine. Lamine comprate che NON si fatturano (a nostro carico, accordi, pacchetti)
-- in impostazioni 'lamine_a_carico' = [{data, pezzi, motivo}]; si aggiungono e tolgono da Analisi → Costi → Lamine.
-- Già dette da Adriano: Univac 3 lamine (produzione maggio–giugno 2026, per accordo) e Audioscope 1 (compresa nel pacchetto).
INSERT INTO impostazioni (chiave, valore)
VALUES ('lamine_a_carico', '[{"data":"2026-06-30","pezzi":3,"motivo":"Univac: non fatturate per accordo (produzione maggio–giugno)"},{"data":"2026-06-30","pezzi":1,"motivo":"Audioscope: compresa nel pacchetto"}]'::jsonb)
ON CONFLICT (chiave) DO NOTHING;
