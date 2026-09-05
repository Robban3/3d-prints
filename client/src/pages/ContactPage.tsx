import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { TextAreaField, TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';

const channels: Array<{ icon: IconName; title: string; lines: string[] }> = [
  { icon: 'headset', title: 'Kundsupport', lines: ['hej@formlabb.se', '031-12 34 56'] },
  { icon: 'clock', title: 'Öppettider', lines: ['Vardagar 09–17', 'Lunchstängt 12–13'] },
  { icon: 'home', title: 'Verkstaden', lines: ['Tredje Långgatan 14', '413 03 Göteborg'] },
  { icon: 'file', title: 'Fakturafrågor', lines: ['faktura@formlabb.se', 'Org.nr 559xxx-xxxx'] },
];

export function ContactPage() {
  const [sent, setSent] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Kontakt"
        title="Hör av dig"
        text="Frågor om en order, ett material eller ett printjobb som inte riktigt passar mallen? Vi svarar normalt samma arbetsdag."
      />

      <section className="section">
        <div className="container cart-layout">
          <div className="panel">
            <h2>Skicka ett meddelande</h2>
            {sent ? (
              <div className="notice notice-success">
                Tack! Vi har tagit emot ditt meddelande och hör av oss inom en arbetsdag.
              </div>
            ) : (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSent(true);
                }}
              >
                <div className="grid-2">
                  <TextField label="Namn" name="kontaktnamn" autoComplete="name" required />
                  <TextField
                    label="E-post"
                    name="kontaktmejl"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </div>
                <TextField
                  label="Ämne"
                  name="amne"
                  placeholder="t.ex. Fråga om en order"
                  required
                />
                <TextAreaField
                  label="Meddelande"
                  name="meddelande"
                  placeholder="Beskriv vad det gäller. Har du ett ordernummer hjälper det oss att svara snabbare."
                  required
                />
                <button type="submit" className="btn btn-lg" style={{ justifySelf: 'start' }}>
                  Skicka meddelande
                </button>
              </form>
            )}
          </div>

          <aside className="stack">
            <div className="panel">
              <h3>Så når du oss</h3>
              <div className="stack" style={{ gap: 18, marginTop: 16 }}>
                {channels.map((channel) => (
                  <div className="mini-feature" key={channel.title}>
                    <Icon name={channel.icon} size={19} />
                    <span>
                      <strong>{channel.title}</strong>
                      {channel.lines.map((line) => (
                        <span key={line} style={{ display: 'block' }}>
                          {line}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <h3>Gäller det en order?</h3>
              <p className="muted" style={{ fontSize: '0.9rem' }}>
                Med ditt ordernummer ser du statusen direkt, utan att behöva vänta på svar.
              </p>
              <Link className="btn btn-ghost btn-block" to="/spara-order">
                Spåra din order
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
