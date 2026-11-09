import Icon from './Icon';

export default function ToastHost({ toasts, onDismiss }) {
  return (
    <div className="sx-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`sx-toast sx-toast--${toast.tone}`}>
          {toast.tone === 'error' && <Icon name="alert" size={14} />}
          <span className="sx-toast__text">{toast.message}</span>
          <button type="button" className="sx-toast__close" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
