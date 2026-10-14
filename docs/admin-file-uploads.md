# Mappar och större printfiler

Admin → Printfiler har namngivna mappar, namnbyte, drag och släpp och en flyttväljare för mobil. Tidigare filer visas som osorterade. Mappar är privat organisation i R2, inte nya publika objektadresser; orderkopplingar och kundfilsgallring ändras inte.

Biblioteksfiler får vara upp till 150 × 1024 × 1024 byte. Nya adminuppladdningar skickas som 8 MiB-delar över autentiserade API-rutter och sparas via S3 multipart till privat R2. Ingen ny CORS-konfiguration, publik bucket eller lagringsnyckel i webbläsaren behövs. Kunduppladdningens tidigare gräns är kvar.

Progressbar visar byte och procent för aktuell fil. Serverns kvitto inväntas mellan delar; vid 100 % visas sparande tills hela objektet och metadata är klara. Ett överföringsfel får ett återförsök av samma del, inte en ny full fil. Slutförande är idempotent. Avbrytningen stoppar kön och städar ofullständiga delar utan att radera färdiga filer.

Sessionsmetadata sparas privat och kan läsas efter containerbyte. S3-anrop, webbläsaranrop och listuppdatering har tidsgränser. Inaktiva uppladdningar städas efter fyra timmar, vid start och ordinarie gallring. Omedelbar återställning av klientkön efter omladdning finns inte: användaren får välja filerna igen.

Testat lokalt med disk och en lokal S3-protokollserver: byteordning, återförsök, slutförande, avbrytning, filgräns och behörigheter. Progress, timeout och avbrytning testas även i klienten. Verklig 150 MB-överföring från användarens nätverk till R2 behöver verifieras i admin; inga verkliga kundfiler används som testdata.
