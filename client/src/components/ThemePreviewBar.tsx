import { Link } from 'react-router';
import { useAppearance } from '../lib/appearance';
import { themeFor } from '../lib/themes';

export function ThemePreviewBar() {
  const { preview, setPreview } = useAppearance();
  if (!preview) return null;
  return <div className="theme-preview-bar" role="status"><span>Förhandsvisning: <strong>{themeFor(preview).name}</strong> · Syns bara för dig</span><div className="row"><Link to="/verkstad?vy=teman">Till adminpanelen</Link><button type="button" onClick={() => setPreview(null)}>Avsluta förhandsvisning</button></div></div>;
}
