const VARIANT_CLASSES = {
  primary: 'bg-primary text-white hover:bg-primary-text focus:ring-primary',
  secondary:
    'bg-white text-primary-text border border-border-light hover:bg-bg-page focus:ring-primary',
  danger: 'bg-danger text-white hover:bg-danger-text focus:ring-danger',
};

/**
 * Button
 *
 * Presentational button used across the app.
 *
 * @param {object} props
 * @param {'primary'|'secondary'|'danger'} [props.variant='primary']
 * @param {boolean} [props.loading=false] Shows a spinner and disables the
 *   control, so callers never have to disable it themselves while a request
 *   is in flight.
 * @param {boolean} [props.fullWidth=false]
 * @param {'button'|'submit'|'reset'} [props.type='button']
 */
export default function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  type = 'button',
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const isDisabled = disabled || loading;

  const classes = [
    'inline-flex h-12 items-center justify-center gap-2 px-6',
    'text-16 font-semibold rounded-button transition-all',
    'focus:outline-none focus:ring-4 focus:ring-opacity-30',
    VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary,
    fullWidth ? 'w-full' : '',
    isDisabled ? 'cursor-not-allowed opacity-60' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      // Assistive tech is told the control is busy, not merely unavailable.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </button>
  );
}
