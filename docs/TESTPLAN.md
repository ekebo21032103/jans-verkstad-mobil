# Testplan innan lansning

1. Kontrollera i en **separat testwebbplats/origin** att gamla registret kan oppnas och att sakerhetskopia fran version 1 kan lasas. Lita inte pa att iOS hemskarmsapp och Safari delar lokal lagring.
2. Testa med minst tva foremal, tva platser och ett foto i testregistret. Exportera JSON-backup.
3. Skapa ett eget Supabase Auth-testkonto, anslut med projektadress och publishable key. Testa e-postlank och losenordsinloggning.
4. Fore forsta molnoverforingen: kontrollera lokalt antal och molnantal. Testa avbrott om BADA ar icke-tomma.
5. Overfor fran en enhet med tva foremal och en bild till tomt moln. Kontrollera i Supabase Table Editor att exakt tva foremal och tva platser finns, och att fotot ligger i **privat** bucket.
6. Oppna tom testapp pa en annan enhet och logga in med samma Supabase Auth-konto. Hamta registret. Foto, kategori, sokord, anteckningar och plats ska folja med.
7. Stang av internet. Skapa/redigera/ta bort testforemal. Kontrollera att appen fungerar lokalt. Sla pa internet, ha appen oppen, synkronisera och kontrollera resultat pa andra enheten.
8. Redigera *samma* testforemal pa bada enheterna utan att synkronisera. Kontrollera att konflikt leder till stopp utan tyst overskrivning.
9. Testa byte av platsnamn, borttagning av plats och att foremal pa platsen foljer med.
10. Verifiera att en annan inloggad testanvandare INTE kan lasa/skriva forsta kontots poster eller bilder.
11. Testa Appens server-cache, uppdatering via GitHub Pages och att en gammal version inte visas efter uppdatering.
12. Kontrollera en ny JSON-export fore lansering. Publicera forst efter dessa tester.
