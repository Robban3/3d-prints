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

Äldre filer i `Tidigare-versioner-for-granskning` är avskilda rensningskandidater,
inte valda slutprodukter. De är bevarade tills den konkreta rensningen godkänts.
