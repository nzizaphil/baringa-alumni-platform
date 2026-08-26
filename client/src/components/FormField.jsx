/**
 * FormField
 *
 * A labelled text input with optional helper text and an error message.
 *
 * The label is bound to the input through `htmlFor`, and the helper and error
 * are bound through `aria-describedby`, so a screen reader announces the
 * requirement and the reason for a rejection along with the field itself.
 *
 * @param {object} props
 * @param {string} props.id Used to derive the helper and error element ids.
 * @param {string} props.label
 * @param {string} [props.helperText] Rendered below the input when there is
 *   no error; the error replaces it so the two never compete.
 * @param {string} [props.error] Field-level message, from local validation or
 *   from the server's `errors` array.
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

  return (
    <div className={['field', error ? 'field--invalid' : '', className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      <input
        id={id}
        type={type}
        ref={inputRef}
        className="field__input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />

      {helperText && (
        <p className="field__helper" id={helperId}>
          {helperText}
        </p>
      )}

      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
