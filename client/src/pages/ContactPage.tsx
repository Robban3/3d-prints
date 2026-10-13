import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';

const channels: Array<{ icon: IconName; title: string; lines: string[] }> = [
  { icon: 'headset', title: 'Kundsupport', lines: ['support@formlabb.se'] },
  { icon: 'clock', title: 'Öppettider', lines: ['Vardagar 09–17', 'Lunchstängt 12–13'] },
  { icon: 'home', title: 'Verkstaden', lines: ['Ebbe Lieberathsgatan 25', '412 83 Göteborg'] },
  { icon: 'file', title: 'Fakturafrågor', lines: ['support@formlabb.se', 'Org.nr 559512-7381'] },
];

export function ContactPage() {

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
            <h2>Maila oss</h2>
            <p>Skriv till support@formlabb.se och ange gärna ordernumret om frågan gäller en beställning. Skicka inte lösenord, privata orderlänkar eller känsliga personuppgifter.</p>
            <a className="btn btn-lg" href="mailto:support@formlabb.se">Öppna ditt e-postprogram</a>
            <p className="field-hint">Du skickar själv meddelandet från ditt e-postprogram. <Link to="/integritet">Läs om personuppgifter och dina rättigheter.</Link></p>
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
                Med din privata orderlänk ser du statusen direkt, utan att behöva vänta på svar.
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
