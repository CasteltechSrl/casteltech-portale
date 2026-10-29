# Pannello "Portale Casteltech" dentro Gmail

Nel pannello a destra di Gmail ci sono le ultime mail con allegati e una casella di ricerca: si sceglie la mail
e compaiono tre tasti (se Gmail passa al pannello la mail aperta, i tasti compaiono anche direttamente):

- **Preventivo**: il testo della mail e gli allegati utili (BOM, pick and place, Gerber, zip…) vanno in
  Preventivi → Documenti del cliente. L'analisi parte da sola; il pannello dà il link "Apri nel portale".
- **Ordine**: la mail intera va in Ordini → Da acquisire e l'IA la legge come i file della cartella Drive.
- **Fattura estera**: la mail intera va in Amministrazione → Autofatture.

La stessa mail mandata due volte non entra due volte (Ordine e Fattura estera).

## Installazione (una volta sola)

### 1. La chiave sul portale
Render → casteltech-portale → Environment → aggiungi `GMAIL_ADDON_CHIAVE` con una frase lunga a caso
(almeno 20 caratteri, es. creata con un generatore di password). Salva: il portale si riavvia.

### 2. Lo script
1. Con l'account di Workspace che amministra casteltech.net apri https://script.google.com → **Nuovo progetto**,
   chiamalo "Portale Casteltech".
2. Impostazioni progetto (ingranaggio) → spunta **Mostra il file manifest "appsscript.json" nell'editor**.
3. Nell'editor: incolla il contenuto di `appsscript.json` al posto di quello che c'è, e il contenuto di `Codice.gs`
   al posto di `Codice.gs`. Se l'indirizzo del portale non è `https://casteltech-portale.onrender.com`, cambialo
   in `urlFetchWhitelist` (con la `/` finale).
4. Impostazioni progetto → **Proprietà script** → aggiungi:
   - `PORTALE_URL` = indirizzo del portale (es. `https://casteltech-portale.onrender.com`)
   - `PORTALE_CHIAVE` = la stessa frase scritta su Render.

### 3. Prova (solo per te)
Esegui il deployment → **Testa i deployment** → Applicazione: Gmail → **Installa**. Ricarica Gmail: a destra compare
l'icona del pannello. Premi "Prova il collegamento": deve rispondere "Collegato al portale come …".

### 4. Per tutto l'ufficio
1. Con l'account @casteltech.net crea un progetto Google Cloud nuovo ("Portale Casteltech Gmail", organizzazione casteltech.net),
   configura la schermata di consenso OAuth con pubblico **Interno**, poi copia il **Numero progetto** (solo cifre) dalla Dashboard
   e incollalo in Apps Script → Impostazioni progetto → Progetto Google Cloud → Imposta progetto.
   Nello stesso progetto Cloud abilita l'**API di Gmail** (console.cloud.google.com/apis/library/gmail.googleapis.com):
   senza, Gmail mostra solo la pagina iniziale del pannello e non i tasti (29/10/2026). Poi Testa i deployment → Disinstalla → Installa.
   (Non "My First Project": se sta su un account Gmail personale, "Interno" non si può scegliere.)
2. Nell'editor: Esegui il deployment → **Nuovo deployment** → tipo **Componente aggiuntivo** → copia l'ID del deployment.
3. Console Google Cloud → API e servizi → abilita **Google Workspace Marketplace SDK** → Configurazione dell'app:
   visibilità **Privata**, integrazione "Componente aggiuntivo di Google Workspace", incolla l'ID del deployment,
   ambiti uguali a quelli di `appsscript.json` → Scheda dello store → **Pubblica** (resta interno a casteltech.net,
   Google non deve approvarlo).
4. Console di amministrazione Google → App → Google Workspace Marketplace → installa "Portale Casteltech" per tutta
   l'organizzazione. Il pannello compare a tutti nel giro di qualche ora.

Quando si cambia `Codice.gs`: incolla la versione nuova e fai Gestisci deployment → modifica → Nuova versione.

## Cosa sa fare e cosa no
- Gli allegati che Gmail mostra come link a Google Drive (file oltre 25 MB) non sono allegati veri: non arrivano.
  Scaricali dal Drive e caricali da Preventivi → Documenti del cliente.
- PDF, modelli 3D, immagini e file oltre 25 MB restano solo nell'elenco dei file, come quando si carica una cartella.
- Il cliente del preventivo si riconosce dal mittente (stessa email o stesso dominio di un cliente del CRM o dell'anagrafica);
  se non è sicuro resta da scegliere nel portale.
