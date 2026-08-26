const VARIANTS = {
  error: {
    container: 'bg-danger bg-opacity-5 border-danger',
    icon: 'fa-circle-exclamation text-danger',
    title: 'text-danger-text',
  },
  success: {
    container: 'bg-success bg-opacity-5 border-success',
    icon: 'fa-circle-check text-success',
    title: 'text-success-text',
  },
};

/**
 * Alert
 *
 * Banner for a success or error outcome, following the prototype's alert strip
 * (`p-4`, 5% tinted background, matching border, icon then message).
 *
 * Errors are announced assertively because they usually follow a failed submit
 * the user is waiting on; successes are announced politely.
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
  const tokens = VARIANTS[variant] ?? VARIANTS.error;

  return (
    <div
      className={[
        'flex gap-3 rounded-input border p-4',
        // Centre the icon against a lone title; align to the top once the
        // banner carries body copy as well.
        children ? 'items-start' : 'items-center',
        tokens.container,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      {...rest}
    >
      <i
        className={`fa-solid ${tokens.icon} text-16 ${children ? 'mt-0.5' : ''}`}
        aria-hidden="true"
      />

      <div className="flex-1 space-y-2">
        {title && <p className={`text-14 font-semibold ${tokens.title}`}>{title}</p>}
        {children && <div className="space-y-2 text-14 text-near-black">{children}</div>}
      </div>

      {onDismiss && (
        <button
          type="button"
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-button text-secondary-text hover:text-near-black focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20"
          onClick={onDismiss}
          aria-label="Dismiss this message"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
