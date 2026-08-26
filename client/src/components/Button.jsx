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
    'button',
    `button--${variant}`,
    fullWidth ? 'button--full' : '',
    loading ? 'is-loading' : '',
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
      {loading && <span className="button__spinner" aria-hidden="true" />}
      <span className="button__label">{children}</span>
    </button>
  );
}
