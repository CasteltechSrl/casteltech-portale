-- Servizio una tantum generico (Adriano 9/11/2026): "costi una tantum" che mette insieme lamina, programmazioni, attrezzaggi…
-- senza dividerli. Vale per tutti i clienti come gli altri UT-…; se c'è già (scritto a mano in Anagrafiche) non si tocca.
INSERT INTO servizi_una_tantum (codice, descrizione, prezzo) VALUES ('UT-COSTI-UNA-TANTUM', 'COSTI UNA TANTUM', NULL)
ON CONFLICT (codice) DO NOTHING;
