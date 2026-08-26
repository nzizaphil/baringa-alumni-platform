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
 *   from the server's `errors` array.
 * @param {boolean} [props.required] Drives the asterisk; callers pass false
 *   while the field is disabled.
 * @param {React.Ref<HTMLInputElement>} [props.inputRef] Lets the page move
 *   focus to the first invalid field after a failed submit.
 */
export default function FormField({
  id,
  label,
  type = 'text',
  helperText,
  error,
  required = false,
  disabled = false,
  inputRef,
  className = '',
  ...inputProps
}) {
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  // The error supersedes the helper, so only one of them is ever described.
  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(' ');

  const inputClasses = [
    'w-full h-11 px-4 rounded-input text-16 transition-all',
    'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20',
    error ? 'border-2 border-danger' : 'border border-border-light',
    disabled
      ? 'bg-bg-page text-secondary-text cursor-not-allowed'
      : 'bg-white text-near-black',
  ].join(' ');

  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
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

      <input
        id={id}
        type={type}
        ref={inputRef}
        className={inputClasses}
        required={required}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />

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
