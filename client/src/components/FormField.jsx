/**
 * FormField
 *
 * A labelled text input with optional helper text and an error message.
 *
 * The label is bound to the input through `htmlFor`, and the helper and error
 * are bound through `aria-describedby`, so a screen reader announces the
 * requirement and the reason for a rejection along with the field itself.
 *
 * A disabled field stays in the DOM and is greyed rather than removed, so the
 * form does not reflow as the association changes. It carries both `disabled`
 * and `aria-disabled`, and the caller supplies helper text saying why it is
 * inactive.
 *
 * @param {object} props
 * @param {string} props.id Used to derive the helper and error element ids.
 * @param {string} props.label
 * @param {string} [props.helperText] Rendered below the input when there is
 *   no error; the error replaces it so the two never compete.
 * @param {string} [props.error] Field-level message, from local validation or
 *   from the server's `errors` array. Implies `invalid`.
 * @param {boolean} [props.invalid] Marks the field invalid - red border and
 *   `aria-invalid` - without a message of its own. The login screen needs this
 *   for a rejected sign-in, where the prototype outlines both fields but the
 *   only explanation is the banner above the form, and saying more per field
 *   would disclose which half of the credentials was wrong.
 * @param {boolean} [props.required] Drives the asterisk; callers pass false
 *   while the field is disabled.
 * @param {React.Ref<HTMLInputElement>} [props.inputRef] Lets the page move
 *   focus to the first invalid field after a failed submit.
 * @param {React.ReactNode} [props.labelAdornment] Optional content pinned to
 *   the right of the label, on the same line. The login screen's "Forgot
 *   password?" affordance sits there in the prototype. Omitting it leaves the
 *   label exactly as before.
 * @param {boolean} [props.multiline=false] Renders a `textarea` instead of an
 *   `input`, for the post composer (F08). Everything around the control - the
 *   bound label, the helper, the error and the `aria-*` wiring - is identical,
 *   which is the whole reason the composer reuses this rather than rebuilding
 *   it: a form control that announces itself differently depending on which
 *   screen drew it is a bug waiting to happen. Only the control's own metrics
 *   change, since a textarea is sized by rows rather than by height.
 * @param {number} [props.rows=6] Rows, when `multiline`.
 */
export default function FormField({
  id,
  label,
  type = 'text',
  helperText,
  error,
  invalid = false,
  required = false,
  disabled = false,
  inputRef,
  labelAdornment,
  multiline = false,
  rows = 6,
  className = '',
  ...inputProps
}) {
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  // A message always means invalid; `invalid` alone means invalid without one.
  const isInvalid = Boolean(error) || invalid;

  // The error supersedes the helper, so only one of them is ever described.
  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(' ');

  const inputClasses = [
    'w-full rounded-input text-16 transition-all',
    // A textarea is sized by its rows and needs vertical padding of its own;
    // an input keeps the 44px height every other field in the app has.
    multiline ? 'px-4 py-3 resize-none' : 'h-11 px-4',
    'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20',
    isInvalid ? 'border-2 border-danger' : 'border border-border-light',
    disabled
      ? 'bg-bg-page text-secondary-text cursor-not-allowed'
      : 'bg-white text-near-black',
  ].join(' ');

  // One set of props for either control, so the two cannot drift apart.
  const controlProps = {
    id,
    ref: inputRef,
    className: inputClasses,
    required,
    disabled,
    'aria-disabled': disabled || undefined,
    'aria-invalid': isInvalid ? true : undefined,
    'aria-describedby': describedBy || undefined,
    ...inputProps,
  };

  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      {/* Without an adornment this is the bare label it has always been; with
          one, the two sit on a single row as the prototype draws them. */}
      <div className={labelAdornment ? 'flex items-center justify-between gap-3' : undefined}>
        <label
          className={`block text-14 font-semibold ${
            disabled ? 'text-secondary-text' : 'text-near-black'
          }`}
          htmlFor={id}
        >
          {label}
          {required && (
            <span className="text-danger-text" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>

        {labelAdornment}
      </div>

      {multiline ? (
        <textarea rows={rows} {...controlProps} />
      ) : (
        <input type={type} {...controlProps} />
      )}

      {helperText && (
        <p className="text-12 text-secondary-text" id={helperId}>
          {helperText}
        </p>
      )}

      {error && (
        <p className="mt-1 flex items-center gap-1.5 text-12 text-danger-text" id={errorId}>
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
