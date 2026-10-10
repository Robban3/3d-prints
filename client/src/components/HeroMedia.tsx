import { useReducedMotion } from '../lib/useReducedMotion';
import type { Media } from '../types';

/**
 * Heron som bild eller video.
 *
 * Videon spelas utan ljud och i loop som en rörlig bakgrund – det är det enda
 * webbläsarna tillåter att starta av sig själv. Har besökaren bett om minskad
 * rörelse spelas den inte alls, utan visas med kontroller så den som vill
 * fortfarande kan se den.
 */
interface Props {
  media: Media;
  poster?: Media;
  autoplay: boolean;
}

export function HeroMedia({ media, poster, autoplay }: Props) {
  const reduced = useReducedMotion();

  if (media.kind === 'image') {
    return (
      <div className="hero-media">
        {/* Dekorativ: rubriken intill säger redan vad sidan handlar om. */}
        <img src={media.url} alt="" loading="eager" />
      </div>
    );
  }

  const shouldPlay = autoplay && !reduced;
  return (
    <div className="hero-media">
      <video
        key={`${media.id}-${shouldPlay ? 'spelar' : 'stilla'}`}
        src={media.url}
        poster={poster?.url}
        // Autospel kräver att videon är ljudlös, och playsInline hindrar att
        // iPhone tar över skärmen.
        autoPlay={shouldPlay}
        muted
        loop={shouldPlay}
        playsInline
        controls={!shouldPlay}
        preload={shouldPlay ? 'auto' : 'metadata'}
      />
    </div>
  );
}
