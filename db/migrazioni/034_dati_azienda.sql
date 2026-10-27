-- Dati dell'azienda mandati da Adriano il 27/10/2026 (Riferimenti aziendali): REA, telefono e PEC.
-- Si scrivono solo se il campo è ancora vuoto, così non si toccano valori già corretti a mano in Impostazioni → Amministrazione.
UPDATE impostazioni SET valore = valore
  || CASE WHEN coalesce(valore->>'rea_ufficio', '') = '' THEN '{"rea_ufficio": "PC"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN coalesce(valore->>'rea_numero', '') = '' THEN '{"rea_numero": "190591"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN coalesce(valore->>'telefono', '') = '' THEN '{"telefono": "05231902464"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN coalesce(valore->>'pec', '') = '' THEN '{"pec": "casteltech@pec.it"}'::jsonb ELSE '{}'::jsonb END,
  aggiornato_il = now()
WHERE chiave = 'azienda';

-- Operazioni con organismi internazionali (es. CERN, INFN in convenzione): non imponibili art. 72, natura N3.4 come le esportazioni
INSERT INTO aliquote_iva (codice, descrizione, percentuale, natura, riferimento_normativo, soggetta_bollo, ordine) VALUES
  ('ART72', 'Non imponibile - art. 72 (organismi internazionali)', 0, 'N3.4', 'Non imponibile art. 72 D.P.R. 633/72', false, 15)
ON CONFLICT (codice) DO NOTHING;
