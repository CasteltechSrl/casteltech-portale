-- Pre-produzione: nessun tempo standard (Adriano, 23/10/2026). I tempi li inserisce l'operatore: casella vuota = 0.
-- Si toglie il valore standard solo se è ancora quello messo dalla 004.
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreFoglioTempi' AND abs(coalesce(valore_default, -1) - 0.16666666666666666) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreAnalisiBom' AND abs(coalesce(valore_default, -1) - 1) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'orePreventivo' AND abs(coalesce(valore_default, -1) - 0.5) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreAcquistoPcb' AND abs(coalesce(valore_default, -1) - 0.16666666666666666) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreAcquistoComponenti' AND abs(coalesce(valore_default, -1) - 0.5) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreAcquistoLamine' AND abs(coalesce(valore_default, -1) - 0.16666666666666666) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'orePrepDoc' AND abs(coalesce(valore_default, -1) - 0.5) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreProgArmadi' AND abs(coalesce(valore_default, -1) - 0.5) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreFilePeP' AND abs(coalesce(valore_default, -1) - 0.5) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreProgPeP' AND abs(coalesce(valore_default, -1) - 1) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreEtichettaturaMateriale' AND abs(coalesce(valore_default, -1) - 1) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreAttrezzature3D' AND abs(coalesce(valore_default, -1) - 0) < 0.0001;
UPDATE parametri SET valore_default = NULL WHERE codice = 'oreCheckPreProduzione' AND abs(coalesce(valore_default, -1) - 0.16666666666666666) < 0.0001;
