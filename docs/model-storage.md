# Modellbibliotek utanför hemsidans repo

Från 24 oktober 2026 sparas modeller i **Dokument\Formlabb\3D-modeller**:

`\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller`

- `Modeller`: Blender/CAD, utskriftsdelar och tillhörande underlag.
- `Leveranser`: modellpaket och samlade STL-/3MF-leveranser.
- `Tidigare-versioner-for-granskning`: tydligt ersatta versioner och äldre
  Blender-backuper, avskilda från aktuella modeller men ännu inte permanent raderade.

Flytten verifierar varje destinationsfil mot originalet med SHA-256 innan originalet
tas bort från repots arbetskatalog. `flyttmanifest.json` och `flyttresultat.json`
i biblioteket dokumenterar flytten. Även lokalt ändrade och tidigare ospårade filer
ingår. Bilder och dokument som hör till själva hemsidan ligger kvar i projektet.

Versionsnummer ensamt är inte skäl att radera en mapp: exempelvis innehåller
`jul-blender-v2` kulornas STL-filer, medan `jul-blender-v3` innehåller senare
servettringsdelar. Båda behövs. Separat vald rak presentaskvariant bevaras också.

Flytten ändrar inte filer som fortfarande finns i Hämtade filer eller på Skrivbordet.
Git-historiken behåller tidigare modellversioner; den skrivs inte om av flytten.
GitHub-kontots LFS-budget var redan förbrukad, vilket blockerar publicering av
tidigare lokala modellcommits. Modellerna behöver inte GitHub för att öppnas lokalt.

För verktyg som läser modeller finns `scripts/model_library.py`. Miljövariabeln
`FORMLABB_MODEL_LIBRARY` kan ange en annan biblioteksrot på en annan dator.
