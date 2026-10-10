import { Link } from 'react-router';
import { Icon } from './Icon';
import type { Campaign } from '../types';

/**
 * Ett kampanjblock på startsidan, som bred banner eller som kort.
 *
 * Adresserna är kontrollerade på servern: interna sökvägar eller https. Interna
 * länkar går genom routern, externa som vanliga länkar.
 */
function Cta({ label, href }: { label: string; href: string }) {
  const internal = href.startsWith('/');
  if (internal) {
    return (
      <Link className="btn" to={href}>
        {label}
        <Icon name="arrowRight" size={16} />
      </Link>
    );
  }
  return (
    <a className="btn" href={href} rel="noreferrer noopener">
      {label}
      <Icon name="arrowRight" size={16} />
    </a>
  );
}

function Media({ campaign }: { campaign: Campaign }) {
  if (!campaign.media) return null;
  if (campaign.media.kind === 'video') {
    return (
      <video
        className="campaign-media"
        src={campaign.media.url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }
  return <img className="campaign-media" src={campaign.media.url} alt="" loading="lazy" />;
}

export function CampaignBlock({ campaign }: { campaign: Campaign }) {
  return (
    <article
      className={`campaign campaign-${campaign.layout}${campaign.media ? '' : ' campaign-nomedia'}`}
    >
      <Media campaign={campaign} />
      <div className="campaign-body">
        {campaign.discountCode && (
          <span className="campaign-code">
            Kod: <strong>{campaign.discountCode}</strong>
          </span>
        )}
        <h3>{campaign.title}</h3>
        <p>{campaign.text}</p>
        {campaign.cta && <Cta label={campaign.cta.label} href={campaign.cta.href} />}
      </div>
    </article>
  );
}
