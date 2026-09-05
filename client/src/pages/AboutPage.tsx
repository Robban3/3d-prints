import { Link } from "react-router-dom";

const faq = [
  {
    q: "Hur lång tid tar en beställning?",
    a: "Lagerförda produkter packas och skickas inom 1–3 arbetsdagar. Egna printjobb tar 2–7 arbetsdagar beroende på storlek och kö – du ser en uppskattning direkt i prisrutan när du beställer.",
  },
  {
    q: "Vilka filformat kan jag skicka in?",
    a: "STL, OBJ och 3MF går rakt in i produktionen. Skickar du STEP eller F3D konverterar vi åt dig. Filen får vara upp till 100 MB – har du något större hör av dig så ordnar vi en överföring.",
  },
  {
    q: "Jag har ingen 3D-modell, bara en idé. Går det ändå?",
    a: "Ja. Beskriv vad du vill ha i beställningsformuläret, gärna med mått och en skiss eller ett foto. Vi återkommer med ett ritförslag och ett pris för modelleringen innan vi börjar printa.",
  },
  {
    q: "Hur räknas priset ut?",
    a: "Priset består av materialåtgång, maskintid, en startavgift på 95 kr per order och eventuella tillval. Fler exemplar ger volymrabatt från fem stycken och uppåt. Ingenting läggs på i efterhand utan att du godkänt det.",
  },
  {
    q: "Kan jag returnera en produkt?",
    a: "Lagervaror har 30 dagars öppet köp i obruten förpackning. Produkter som printats specifikt efter din fil eller dina mått är undantagna, men går något fel i produktionen printar vi om utan kostnad.",
  },
  {
    q: "Är materialen säkra för mat?",
    a: "PETG-produkterna i kökskategorin printas med livsmedelsgodkänt filament och stålmunstycke. Tänk ändå på att lagerlinjerna kan samla bakterier – handdiska hellre än maskindiska när det gäller ytor som möter mat direkt.",
  },
];

export function AboutPage() {
  return (
    <section className="section">
      <div className="container receipt">
        <span className="eyebrow">Om Formlabb</span>
        <h1>Åtta maskiner, en verkstad, inga mellanhänder</h1>
        <p className="muted">
          Formlabb började som två printare i ett källarförråd på Hisingen och
          är i dag en verkstad på Tredje Långgatan med åtta maskiner igång. Vi
          ritar våra egna produkter, printar dem i små serier och tar samtidigt
          emot kunduppdrag – från en enda reservdel till serier på hundratals
          delar.
        </p>
        <p className="muted">
          Allt spillmaterial mals ned och blir nytt filament, och vi skickar i
          papper i stället för plast. Det gör inte oss klimatneutrala, men det
          gör skillnaden mätbar.
        </p>

        <div className="panel" style={{ margin: "32px 0" }}>
          <div className="grid-2">
            <div>
              <h3>Frakt</h3>
              <p
                className="muted"
                style={{ fontSize: "0.93rem", marginBottom: 0 }}
              >
                59 kr spårbart med PostNord, fritt över 599 kr. Vi packar i
                returkartong så att en eventuell retur inte kräver nytt
                emballage.
              </p>
            </div>
            <div>
              <h3>Kontakt</h3>
              <p
                className="muted"
                style={{ fontSize: "0.93rem", marginBottom: 0 }}
              >
                <a href="mailto:hej@formlabb.se">hej@formlabb.se</a>
                <br />
                031-12 34 56, vardagar 09–17
                <br />
                Tredje Långgatan 14, 413 03 Göteborg
              </p>
            </div>
          </div>
        </div>

        <h2>Vanliga frågor</h2>
        <div style={{ marginTop: 12 }}>
          {faq.map((entry) => (
            <details className="faq" key={entry.q}>
              <summary>{entry.q}</summary>
              <p>{entry.a}</p>
            </details>
          ))}
        </div>

        <div className="panel center" style={{ marginTop: 40 }}>
          <h3>Har du en fil som väntar?</h3>
          <p className="muted">
            Räkna ut vad den kostar att printa – det tar tjugo sekunder.
          </p>
          <Link className="btn btn-lg" to="/egen-print">
            Beställ egen print
          </Link>
        </div>
      </div>
    </section>
  );
}
