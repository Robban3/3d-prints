# Modellfiler

Alla nya 3D-modeller, Blenderprojekt, CAD-filer, STL/3MF och tillhörande modellpaket
ska sparas i användarens modellbibliotek, inte i webbprojektet:

`\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller`

Det motsvarar **Dokument\Formlabb\3D-modeller** i Utforskaren. Aktuella arbetsmodeller
ligger under `Modeller`, leveranspaket under `Leveranser`. Använd en undermapp per
produkt. Dokument är en omdirigerad nätverksmapp på denna dator.

Lägg inte tillbaka stora modellfiler i Git/Git LFS. Webbplatsens nödvändiga
produktbilder och kod hör fortfarande till webbprojektet. Modellverktyg kan läsa
sökvägen via `FORMLABB_MODEL_LIBRARY` eller `scripts/model_library.py`.

Behåll aktuella modeller och uttryckligen valda separata designvarianter. Undvik
att fylla biblioteket med en ny versionsmapp för varje liten justering. Ett lägre
versionsnummer kan dock innehålla unika utskriftsdelar; radera inte en hel mapp
enbart på dess namn. Den konkret godkända listan över 291 äldre filer rensades
den 24 oktober 2026; kvitto finns i modellbiblioteket.
