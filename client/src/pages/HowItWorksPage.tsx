import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { StatsRow } from '../components/StatsRow';
import type { IconName } from '../components/Icon';

const steps: Array<{ icon: IconName; title: string; text: string }> = [
  {
    icon: 'upload',
    title: 'Du laddar upp filen',
    text: 'STL, OBJ, 3MF, STEP eller F3D. Filen sparas hos oss direkt och du får en bekräftelse på att den kommit fram. Har du ingen fil beskriver du i stället vad du vill ha, gärna med mått och en skiss.',
  },
  {
    icon: 'card',
    title: 'Du får pris på sekunden',
    text: 'Priset räknas fram utifrån material, lagerhöjd, volym, fyllnadsgrad och antal. Du ser hela uppdelningen – materialkostnad, maskintid, startavgift och eventuell volymrabatt – innan du beställer.',
  },
  {
    icon: 'search',
    title: 'Vi kontrollerar modellen',
    text: 'Innan produktion mäter vi filen, letar efter väggar som är för tunna och kontrollerar att detaljen går att printa utan att kvaliteten blir lidande. Behöver något ändras hör vi av oss först.',
  },
  {
    icon: 'gear',
    title: 'Vi printar och efterbearbetar',
    text: 'Jobbet läggs i kön och startar oftast samma dag. Stödmaterial tas bort för hand, och har du valt efterbearbetning slipas och poleras de synliga ytorna.',
  },
  {
    icon: 'truck',
    title: 'Leverans hem till dig',
    text: 'Spårbart med PostNord, i returkartong så att en eventuell retur inte kräver nytt emballage. Du följer ordern hela vägen med ditt ordernummer.',
  },
];

export function HowItWorksPage() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="badge badge-accent" style={{ marginBottom: 14 }}>
            Så funkar det
          </span>
          <h1>Från fil till färdig detalj</h1>
          <p>
            Fem steg, och du vet vad det kostar redan i det andra. Ingenting läggs på i efterhand
            utan att du godkänt det.
          </p>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          {steps.map((step, index) => (
            <div className="panel" key={step.title}>
              <div
                className="row"
                style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'nowrap' }}
              >
                <span className="step-num" style={{ width: 32, height: 32, fontSize: '0.85rem' }}>
                  {index + 1}
                </span>
                <div>
                  <div className="row" style={{ gap: 9, marginBottom: 4 }}>
                    <Icon name={step.icon} size={19} />
                    <h3 style={{ margin: 0 }}>{step.title}</h3>
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
                    {step.text}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ margin: '34px 0' }}>
          <StatsRow />
        </div>

        <div className="panel center">
          <h3>Redo att sätta igång?</h3>
          <p className="muted">Ladda upp filen så har du ett pris inom någon minut.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-lg" to="/egen-print">
              Beställ egen print
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/produkter">
              Se sortimentet
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
