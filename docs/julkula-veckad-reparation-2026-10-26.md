# Julkula veckad röd – meshreparation

Källa: användarens `Desktop/modeller m3f/Julkula - veckad (röd).3mf`. Originalet har inte ändrats.

Originalets 2 393 044 trianglar innehöll 893 kanter med fler än två angränsande trianglar. Geometri korsade alla undersökta plan mellan 61,3 och 62,1 mm, trots Bambu Studios varning om tomma utskriftslager. Meshfelet är konstaterat; det är inte ensamt bevis för orsaken till slicerns varning.

En kopia reparerades i Blender med 0,12 mm voxelrekonstruktion, förenkling och lokal slutning av mikroöppningar. Resultatet har 981 662 trianglar och noll icke-manifoldkanter. Röda och guldfärgade ytor projicerades från originalet. Färggränserna är därmed en approximation. 3MF-paketet behåller originalets Bambu-inställningar och använder målningen `4`/`8` för rött/guld på de nya trianglarna. STL innehåller enbart geometri.

Arbetsfil: `Dokument/Formlabb/3D-modeller/Modeller/julkula-veckad-rod/Julkula-veckad-rod.blend`.

Leverans: `Dokument/Formlabb/3D-modeller/Leveranser/Julkula-veckad-rod/` med 3MF, STL, kontrollbild och kontrollrapport. Den reparerade modellen har öppnats och visats i Blender. Beredning och fysisk provutskrift behöver verifieras innan modellen betraktas som produktionsklar. Originalprojektet använder en X1 Carbon-profil; välj rätt skrivare före utskrift.
