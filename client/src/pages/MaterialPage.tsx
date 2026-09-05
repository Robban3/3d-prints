import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { fetchConfig } from '../lib/api';
import { useAsync } from '../lib/useAsync';

export function MaterialPage() {
  const { data, loading, error } = useAsync(() => fetchConfig(), []);

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>Material</h1>
          <p>
            Vi printar i fem material. Valet styr både hur detaljen känns i handen och vad den tål –
            här är skillnaderna, och vad de kostar i förhållande till varandra.
          </p>
        </div>

        {error && <p className="notice notice-error">{error}</p>}
        {loading && <div className="skeleton" style={{ aspectRatio: 'auto', height: 300 }} />}

        <div className="grid-2" style={{ gap: 16 }}>
          {(data?.materials ?? []).map((material) => (
            <div className="panel" key={material.id}>
              <div className="spread" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{material.name}</h3>
                <span className="badge badge-accent">
                  {material.priceFactor === 1
                    ? 'Grundpris'
                    : `×${material.priceFactor.toString().replace('.', ',')}`}
                </span>
              </div>
              <p className="muted" style={{ fontSize: '0.91rem' }}>
                {material.description}
              </p>
              <ul className="tick-list">
                {material.traits.map((trait) => (
                  <li key={trait}>{trait}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="panel" style={{ marginTop: 26 }}>
          <h2>Utskriftskvalitet</h2>
          <p className="muted">
            Lagerhöjden avgör hur mycket lagerlinjerna syns. Finare lager tar längre tid och kostar
            därför mer i maskintid.
          </p>
          <table className="spec-table">
            <thead>
              <tr>
                <th>Kvalitet</th>
                <th style={{ width: '22%' }}>Lagerhöjd</th>
                <th style={{ width: '36%' }}>Passar till</th>
              </tr>
            </thead>
            <tbody>
              {(data?.qualities ?? []).map((quality) => (
                <tr key={quality.id}>
                  <th>{quality.name}</th>
                  <td>{quality.layerHeightMm.toString().replace('.', ',')} mm</td>
                  <td>{quality.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel center" style={{ marginTop: 26 }}>
          <h3>Osäker på vilket material som passar?</h3>
          <p className="muted">Beskriv vad detaljen ska klara så föreslår vi ett.</p>
          <Link className="btn" to="/egen-print">
            Beställ egen print
            <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
