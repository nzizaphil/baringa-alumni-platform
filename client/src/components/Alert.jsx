/**
 * Alert
 *
 * Banner for a success or error outcome.
 *
 * Errors are announced assertively because they usually follow a failed
 * submit the user is waiting on; successes are announced politely.
 *
 * @param {object} props
 * @param {'success'|'error'} [props.variant='error']
 * @param {string} [props.title] Optional heading above the body.
 * @param {() => void} [props.onDismiss] Renders a dismiss button when given.
 */
export default function Alert({
  variant = 'error',
  title,
  onDismiss,
  className = '',
  children,
  ...rest
}) {
  const isError = variant === 'error';

  return (
    <div
      className={['alert', `alert--${variant}`, className].filter(Boolean).join(' ')}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      {...rest}
    >
      <span className="alert__icon" aria-hidden="true">
        {isError ? '!' : '✓'}
      </span>
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__content">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="alert__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss this message"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      )}
    </div>
  );
}
