# Star Bowling – kropp 100 mm

Utgår från användarens `Desktop/Star Bowling/Saltkar_100mm med lock.3mf` och `Pepparkar_100mm med lock.3mf`.

Kropparna är nu 47,54 × 47,54 × 100 mm, inklusive textrelief. Hals och befintliga lock skalas med faktorn 1,1535483787, vilket bevarar den ursprungliga gängpassningen proportionellt. Locken är cirka 26,63 mm i diameter och 25,58 mm höga. Monterad totalhöjd är cirka 115,35 mm. Saltlocket har tre hål, pepparlocket fyra.

Den gamla textytan ersätts med en ren rotationsyta uppmätt från originalets omärkta baksida. Halsens och gängans originalgeometri behålls. Ny Arial Bold-text följer kroppens krökning: nominellt 1 mm mellan bokstäverna i STAR BOWLING och 1,2 mm i SALT/PEPPAR. Fontstorlekar 6,4 respektive 7 mm; relief cirka 0,6 mm med 0,2 mm inbäddning. Texten har fogats geometriskt till respektive kropp.

Verifiering: båda exporterade STL-kroppar mäter 47,5397 × 47,5397 × 100 mm. Båda kroppar och lock har noll icke-manifoldkanter. 3MF-paketens ZIP-kontroll och XML-parse är godkända. Bambu-paket innehåller separata kroppar/lock för utskrift och bevarade monteringspositioner. Fysisk gängpassning och faktisk textutskrift är inte provade.

Arbetsprojekt: `Dokument/Formlabb/3D-modeller/Modeller/starbowling-salt-peppar-kropp-100mm/StarBowling-kropp-100mm.blend`.

Leverans: `Dokument/Formlabb/3D-modeller/Leveranser/StarBowling-kropp-100mm/` samt ZIP med samma namn under Leveranser. Innehåller två 3MF-projekt, fyra STL-delar, kontrollbilder, rapport och läsanvisning. Originalfilerna har inte skrivits över.

## Rättad 3MF-paketering

Den första exportens XML använde kodningsnamnet `utf8` och saknade objektens produktions-UUID, trots att komponenterna refererade till dem. Paketkontrollen i Python var otillräcklig för att verifiera Bambu-inläsningen. Exporten har rättats till UTF-8, rätt UUID-referenser och borttagna referenser till saknade miniatyrbilder och inaktuella monteringsdata.

Båda rättade 3MF-filerna har därefter öppnats i Bambu Studio 02.08.04.57 och visuellt verifierats: saltkaret visas med elfenbensfärgad kropp/lock, röda halsränder och mörkblå text; pepparkaret med marinblå kropp/lock samt elfenbensfärgade ränder och text. Leverans-ZIP har uppdaterats med de rättade filerna. Utskrift har inte startats.
