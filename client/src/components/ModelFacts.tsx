import { Icon } from './Icon';
import type { ModelAnalysis } from '../types';

/**
 * Visar vad vi läst ut ur kundens fil. Volymen är den siffra priset räknas på,
 * så den står först – och varningarna säger till när något behöver hanteras
 * innan filen går till produktion.
 */

const FORMAT_NAMES: Record<ModelAnalysis['format'], string> = {
  stl: 'STL',
  obj: 'OBJ',
  '3mf': '3MF',
};

function number(value: number): string {
  return value.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
}

export function ModelFacts({ analysis }: { analysis: ModelAnalysis }) {
  const { bounds } = analysis;

  return (
    <div className="model-facts">
      <div className="model-facts-head">
        <Icon name="cube" size={16} />
        <span>Uppmätt ur din {FORMAT_NAMES[analysis.format]}-fil</span>
      </div>

      <table className="spec-table">
        <tbody>
          <tr>
            <th>Volym</th>
            <td>
              <strong>{number(analysis.volumeCm3)} cm³</strong>
            </td>
          </tr>
          <tr>
            <th>Mått (B×D×H)</th>
            <td>
              {number(bounds.width)} × {number(bounds.depth)} × {number(bounds.height)} mm
            </td>
          </tr>
          <tr>
            <th>Yta</th>
            <td>{number(analysis.surfaceAreaCm2)} cm²</td>
          </tr>
          <tr>
            <th>Trianglar</th>
            <td>{analysis.triangles.toLocaleString('sv-SE')}</td>
          </tr>
          <tr>
            <th>Mesh</th>
            <td>
              {analysis.watertight === null
                ? 'För tung att kontrollera'
                : analysis.watertight
                  ? 'Sluten och klar att slica'
                  : 'Behöver lagas – se nedan'}
            </td>
          </tr>
        </tbody>
      </table>

      {analysis.warnings.length === 0 ? (
        <p className="model-facts-ok">
          Priset bygger på filens verkliga volym, så det här är vad jobbet kostar.
        </p>
      ) : (
        <ul className="model-warnings">
          {analysis.warnings.map((warning) => (
            <li key={warning.code} className={`model-warning ${warning.severity}`}>
              <Icon name={warning.severity === 'info' ? 'info' : 'alert'} size={15} />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
