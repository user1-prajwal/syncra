import Icon from './Icon';

/** Square icon button with an accessible name and a themed tooltip (CSS only; hidden on touch). */
export default function IconButton({ icon, label, tip, tipPos = 'bottom', active = false, size = 16, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`sx-iconbtn${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      data-tip={tip ?? label}
      data-tip-pos={tipPos}
      {...rest}
    >
      <Icon name={icon} size={size} />
      {children}
    </button>
  );
}
