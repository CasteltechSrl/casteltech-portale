-- Ruolo Amministratore (Adriano 3/11/2026): come l'ufficio, più è l'unico che cambia i ruoli degli utenti e vede stipendi e buste paga.
-- Il primo amministratore lo sceglie l'avvio del portale (catalogo-db.ts): l'utente con l'email di ADMIN_EMAIL, se non ce n'è nessuno.
ALTER TABLE utenti DROP CONSTRAINT IF EXISTS utenti_ruolo_check;
ALTER TABLE utenti ADD CONSTRAINT utenti_ruolo_check CHECK (ruolo IN ('amministratore', 'ufficio', 'produzione', 'contabilita', 'esterno'));
