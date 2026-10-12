import { Icon } from './Icon';

export function TopBar() {
  return (
    <div className="topbar campaign-topbar">
      <div className="container">
        <Icon name="tree" size={13} />
        <span>Lokalt 3D-printade gåvor för en mer personlig jul</span>
        <span className="campaign-topbar-divider" aria-hidden="true">|</span>
        <span>Fri frakt över 699 kr</span>
      </div>
    </div>
  );
}
