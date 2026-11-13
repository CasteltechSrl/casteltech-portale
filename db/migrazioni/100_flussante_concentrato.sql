-- Adriano 13/11/2026: la pasta flussante EO-FP-003 da 100 ml è un concentrato, con 100 ml si fa una tanica da 20 l.
-- Nel Materiale di consumo (Acquisti) una confezione vale quindi 20 l di flussante. Solo se l'ufficio non ha già scritto un contenuto.
UPDATE materiali_consumo SET contenuto = 20, aggiornato_il = now() WHERE codice = 'MC-FLU-008' AND contenuto IS NULL;
