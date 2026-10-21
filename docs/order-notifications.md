# Avisering om nya order

Uppdaterat mejlflöde och gemensam HTML-design beskrivs i [email-workflow.md](email-workflow.md). Nya kundmejl för komplettering, offert, försening och bekräftad återbetalning skickas manuellt från orderkortet; avbokningsbesked följer statusbytet.

Nya butiksorder och kundunika printorder skickar tre separata mejl: kundens orderbekräftelse samt intern avisering till nygren.cn@gmail.com och rvdv1122@gmail.com. Mottagarna ser inte varandras adresser och de interna adresserna visas inte för kunden.

Aviseringen innehåller ordernummer, beställningens innehåll, artikelnummer när det finns, totalsumma och länk till adminpanelen som kräver inloggning. Den innehåller inte kundens privata orderlänk eller leveransadress. Testorder märks TEST; en avisering är inte ett kvitto på genomförd betalning.

Samma befintliga mejltransport och avsändare används som för kundbekräftelsen. Utskick görs oberoende så att ett misslyckat kundmejl inte hindrar försök till båda interna mottagarna. Ett mejlfel ändrar inte en redan sparad order. Automatiska varaktiga återförsök saknas fortfarande; orderlistan är därför primär källa. Ingen extra avisering skickas vid enbart statusändring.

Verifiering: malltester och isolerat orderflöde med lokal utkorg för både butiksorder och kundorder. Dessa tester skickar inga mejl till riktiga mottagare. Leverans till Gmail behöver bekräftas separat efter publicering.
