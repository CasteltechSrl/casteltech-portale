/**
 * Copia automatica dei backup sul PC dell'ufficio, nella cartella di Google Drive (Adriano 1/11/2026:
 * "G:\Il mio Drive\01_LAVORO\CASTELTECH\16_Backup\Portale_Render").
 *
 * Come funziona: in Impostazioni → Backup il pulsante "Installa sul PC" scarica un piccolo programma (.bat) con dentro
 * la chiave; aperto una volta, crea un'attività pianificata di Windows che ogni sera alle 18:30 (o alla prima accensione
 * se il PC era spento) chiede al portale quali copie mancano e le salva nella cartella. Google Drive per desktop le porta
 * nel cloud da solo. Il portale non tocca Google: niente account di servizio né deleghe.
 *
 * Qui le regole (provate nei test): quali copie scaricare e quali togliere dalla cartella.
 */

/** Cartella proposta all'installazione (se sul PC non c'è, il programma chiede dove salvare). */
export const CARTELLA_PC_PREDEFINITA = 'G:\\Il mio Drive\\01_LAVORO\\CASTELTECH\\16_Backup\\Portale_Render';
/** Nome dell'attività pianificata di Windows. */
export const ATTIVITA_PC = 'Portale Casteltech - copia dei backup';
/** Sul PC si tengono tutte le copie degli ultimi 60 giorni, poi una al mese (la prima del mese) per sempre. */
export const GIORNI_SUL_PC = 60;

/** Solo i nomi dei file di backup del portale: niente percorsi, niente altri file della cartella. */
export const NOME_BACKUP = /^casteltech-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}[\w-]*\.json\.gz$/;

/** "casteltech-backup-2026-11-02-19-30.json.gz" → "2026-11-02" (giorno nel nome, ora UTC). */
export function giornoDelBackup(nome: string): string | null {
  return /^casteltech-backup-(\d{4}-\d{2}-\d{2})/.exec(nome)?.[1] ?? null;
}

export interface CopiaPortale { nome: string; byte: number }
export interface PianoPc { scarica: CopiaPortale[]; togli: string[] }

/**
 * Cosa fare sul PC, date le copie sul disco del portale e i file già nella cartella.
 * - scarica: le copie più recenti dell'ultima già presente (il nome ha data e ora, quindi si confronta il testo);
 *   alla prima volta (cartella vuota) solo l'ultima, per non riempire Drive con 30 copie;
 * - togli: le copie più vecchie di 60 giorni, tranne la prima di ogni mese, che resta per sempre.
 */
export function pianoCopiePc(portale: CopiaPortale[], locali: string[], oggi = new Date()): PianoPc {
  const sulPc = locali.filter(n => NOME_BACKUP.test(n)).sort();
  const nelPortale = portale.filter(c => NOME_BACKUP.test(c.nome)).sort((a, b) => a.nome.localeCompare(b.nome));
  const ultimaSulPc = sulPc.at(-1);
  const presenti = new Set(sulPc);
  const scarica = ultimaSulPc
    ? nelPortale.filter(c => c.nome > ultimaSulPc && !presenti.has(c.nome))
    : nelPortale.slice(-1);

  const limite = new Date(oggi.getTime() - GIORNI_SUL_PC * 86_400_000).toISOString().slice(0, 10);
  const primaDelMese = new Map<string, string>();
  for (const n of sulPc) { const mese = giornoDelBackup(n)!.slice(0, 7); if (!primaDelMese.has(mese)) primaDelMese.set(mese, n); }
  const tenute = new Set(primaDelMese.values());
  const togli = sulPc.filter(n => giornoDelBackup(n)! < limite && !tenute.has(n));
  return { scarica, togli };
}

/** Testo tra apici singoli di PowerShell ('' = apice). */
const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Programma che gira ogni sera sul PC (scritto dall'installatore in %LOCALAPPDATA%\CasteltechBackup). Solo caratteri ASCII. */
const SCARICATORE = String.raw`# Portale Casteltech: copia dei backup nella cartella di Google Drive (si avvia da solo ogni sera)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Portale = __PORTALE__
$Chiave = __CHIAVE__
$Cartella = __CARTELLA__
$Registro = Join-Path $PSScriptRoot 'registro.txt'
function Scrivi([string]$testo) { Add-Content -LiteralPath $Registro -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm') + ' ' + $testo) }
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  if (-not (Test-Path -LiteralPath $Cartella)) { throw "cartella non raggiungibile: $Cartella (Google Drive e' acceso?)" }
  $intestazioni = @{ 'x-chiave-portale' = $Chiave }
  $locali = @(Get-ChildItem -LiteralPath $Cartella -Filter 'casteltech-backup-*.json.gz' | ForEach-Object { $_.Name })
  $corpo = ConvertTo-Json @{ locali = $locali } -Compress
  $piano = Invoke-RestMethod -Method Post -Uri "$Portale/api/backup/piano" -Headers $intestazioni -ContentType 'application/json' -Body $corpo -TimeoutSec 300
  $copie = @($piano.scarica)
  foreach ($c in $copie) {
    $parziale = Join-Path $env:TEMP ($c.nome + '.parziale')
    Invoke-WebRequest -UseBasicParsing -Uri ("$Portale/api/backup/file/" + [uri]::EscapeDataString($c.nome)) -Headers $intestazioni -OutFile $parziale -TimeoutSec 3600
    if ((Get-Item -LiteralPath $parziale).Length -ne [int64]$c.byte) { Remove-Item -LiteralPath $parziale; throw "copia arrivata a meta': $($c.nome)" }
    Move-Item -LiteralPath $parziale -Destination (Join-Path $Cartella $c.nome) -Force
    Scrivi "salvata $($c.nome)"
  }
  foreach ($n in @($piano.togli)) { Remove-Item -LiteralPath (Join-Path $Cartella $n) -ErrorAction SilentlyContinue; Scrivi "tolta (piu' vecchia di 60 giorni) $n" }
  if ($copie.Count -eq 0) { Scrivi 'nessuna copia nuova' }
  exit 0
} catch {
  Scrivi ('ERRORE: ' + $_.Exception.Message)
  exit 1
}
`;

/**
 * Installatore da aprire con un doppio clic: le prime righe sono per il Prompt dei comandi, che passa il resto del file
 * a PowerShell (così basta un solo file, senza cambiare le impostazioni di sicurezza del PC).
 * Crea %LOCALAPPDATA%\CasteltechBackup\scarica-backup.ps1, l'attività pianificata delle 18:30 e fa subito la prima copia.
 */
export function installatoreBackupPc(o: { portale: string; chiave: string; cartella?: string }): string {
  const scaricatore = SCARICATORE.replace('__PORTALE__', () => '__P__').replace('__CHIAVE__', () => '__K__').replace('__CARTELLA__', () => '__C__');
  const righe = [
    '@echo off',
    'rem Portale Casteltech: installa la copia automatica dei backup in Google Drive su questo PC.',
    'title Portale Casteltech - copia dei backup',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText('%~f0'); $m='#'+'POWERSHELL#'; iex $f.Substring($f.IndexOf($m)+$m.Length)"`,
    'echo.',
    'pause',
    'exit /b',
    '#POWERSHELL#',
    "$ErrorActionPreference = 'Stop'",
    `$Portale = ${ps(o.portale)}`,
    `$Chiave = ${ps(o.chiave)}`,
    `$Cartella = ${ps(o.cartella ?? CARTELLA_PC_PREDEFINITA)}`,
    "$Casa = Join-Path $env:LOCALAPPDATA 'CasteltechBackup'",
    "Write-Host 'Portale Casteltech - copia automatica dei backup su questo PC'",
    "Write-Host ''",
    'while (-not (Test-Path -LiteralPath $Cartella)) {',
    '  Write-Host "Non trovo la cartella: $Cartella"',
    "  $Cartella = (Read-Host 'Scrivi o incolla la cartella dove salvare i backup').Trim().Trim('\"')",
    '}',
    'New-Item -ItemType Directory -Force -Path $Casa | Out-Null',
    "$q = { param($s) \"'\" + $s.Replace(\"'\", \"''\") + \"'\" }",
    "$testo = @'",
    scaricatore.trimEnd(),
    "'@",
    "$testo = $testo.Replace('__P__', (& $q $Portale)).Replace('__K__', (& $q $Chiave)).Replace('__C__', (& $q $Cartella))",
    "$File = Join-Path $Casa 'scarica-backup.ps1'",
    'Set-Content -LiteralPath $File -Value $testo -Encoding UTF8',
    "$azione = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"' + $File + '\"')",
    "$quando = New-ScheduledTaskTrigger -Daily -At '18:30'",
    '$regole = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)',
    `Register-ScheduledTask -TaskName ${ps(ATTIVITA_PC)} -Action $azione -Trigger $quando -Settings $regole -Description 'Ogni sera salva le copie nuove del Portale Casteltech nella cartella di Google Drive' -Force | Out-Null`,
    "Write-Host 'Attivita pianificata creata: ogni sera alle 18:30 (se il PC e spento, alla prima accensione).'",
    "Write-Host 'Prima copia in corso, attendi...'",
    '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $File',
    'if ($LASTEXITCODE -eq 0) {',
    '  Write-Host "FATTO. Le copie vanno in: $Cartella"',
    '} else {',
    "  Write-Host ('Qualcosa non va: guarda ' + (Join-Path $Casa 'registro.txt'))",
    '}',
    "Get-Content -LiteralPath (Join-Path $Casa 'registro.txt') -Tail 5 -ErrorAction SilentlyContinue",
    '',
  ];
  return righe.join('\r\n');
}
