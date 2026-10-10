import { useState } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';
import { ApiError, fetchMaterialGuide } from '../lib/api';
import type { GuideAnswers, GuideFlex, GuideLoad, GuidePlace, GuideResult } from '../types';

/**
 * Tre frågor om hur delen ska användas, och ett rekommenderat material.
 *
 * Materialsidan listar egenskaper, men kunden måste själv översätta "ska sitta
 * i bilen på sommaren" till PETG. Uträkningen görs på servern, mot materialens
 * egna egenskaper, så den finns bara på ett ställe.
 */

const places: Array<{ id: GuidePlace; label: string; text: string }> = [
  { id: 'inomhus', label: 'Inomhus', text: 'I ett rum, i normal temperatur.' },
  { id: 'utomhus', label: 'Utomhus', text: 'Utsatt för regn, sol och kyla.' },
  { id: 'varmt', label: 'Varmt', text: 'I en bil, nära en lampa eller i ett motorrum.' },
];

const loads: Array<{ id: GuideLoad; label: string; text: string }> = [
  { id: 'dekor', label: 'Bara se fin ut', text: 'Dekor, modeller och figurer.' },
  { id: 'daglig', label: 'Användas dagligen', text: 'Hållare, lådor och prylar som hanteras.' },
  { id: 'last', label: 'Bära last', text: 'Fästen och delar som belastas.' },
];

const flexes: Array<{ id: GuideFlex; label: string; text: string }> = [
  { id: 'styv', label: 'Styv', text: 'Ska inte ge efter alls.' },
  { id: 'nagot', label: 'Lite', text: 'Får fjädra en aning.' },
  { id: 'mjuk', label: 'Mjuk', text: 'Gummiliknande, som en packning.' },
];

const questions = [
  { key: 'place' as const, title: 'Var ska delen sitta?', options: places },
  { key: 'load' as const, title: 'Vad ska den klara?', options: loads },
  { key: 'flex' as const, title: 'Ska den vara böjlig?', options: flexes },
];

export function MaterialGuide() {
  const [answers, setAnswers] = useState<Partial<GuideAnswers>>({});
  const [results, setResults] = useState<GuideResult[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const complete = answers.place && answers.load && answers.flex;

  async function ask() {
    if (!complete) return;
    setBusy(true);
    setError('');
    try {
      const result = await fetchMaterialGuide(answers as GuideAnswers);
      setResults(result.results);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Guiden kunde inte svara.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setAnswers({});
    setResults(null);
    setError('');
  }

  if (results) {
    // Toppen är rekommendationen; de två närmast efter visas som alternativ.
    const [best, ...rest] = results;
    return (
      <div className="panel material-guide">
        <h3 style={{ marginTop: 0 }}>Vi rekommenderar {best?.material.name}</h3>
        {best && (
          <>
            <p className="muted">{best.material.description}</p>
            <ul className="tick-list">
              {best.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {best.warnings.length > 0 && (
              <ul className="model-warnings">
                {best.warnings.map((warning) => (
                  <li key={warning} className="model-warning warning">
                    <Icon name="alert" size={15} />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {rest.length > 0 && (
          <div className="guide-alternatives">
            <span className="field-label">Fungerar också</span>
            {rest.slice(0, 2).map((result) => (
              <div key={result.material.id} className="guide-alternative">
                <strong>{result.material.name}</strong>
                <span className="dim">
                  {result.material.priceFactor === 1
                    ? 'Grundpris'
                    : `×${result.material.priceFactor.toString().replace('.', ',')} materialpris`}
                </span>
                <span className="guide-alternative-text">
                  {result.warnings[0] ?? result.reasons[0] ?? ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <Link className="btn" to="/egen-print">
            Räkna ut ett pris
          </Link>
          <button type="button" className="btn btn-ghost" onClick={reset}>
            Börja om
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel material-guide">
      <h3 style={{ marginTop: 0 }}>Vilket material ska du välja?</h3>
      <p className="muted">
        Svara på tre frågor om hur delen ska användas, så föreslår vi ett material.
      </p>

      <div className="stack" style={{ gap: 20 }}>
        {questions.map((question) => (
          <div key={question.key}>
            <span className="field-label">{question.title}</span>
            <div className="option-cards" style={{ marginTop: 8 }}>
              {question.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="option-card"
                  aria-pressed={answers[question.key] === option.id}
                  onClick={() =>
                    setAnswers((current) => ({ ...current, [question.key]: option.id }))
                  }
                >
                  <strong>{option.label}</strong>
                  <span>{option.text}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      <button
        type="button"
        className="btn btn-lg"
        style={{ marginTop: 20 }}
        disabled={!complete || busy}
        onClick={() => void ask()}
      >
        {busy ? 'Räknar…' : complete ? 'Visa förslaget' : 'Svara på alla tre'}
      </button>
    </div>
  );
}
