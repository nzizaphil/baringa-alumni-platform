/**
 * RadioGroup
 *
 * A set of mutually exclusive choices grouped in a fieldset so the legend
 * labels every option, with the helper and error bound to the group through
 * `aria-describedby` (the group, not the individual radios, is what fails
 * validation).
 *
 * The first radio carries `inputRef` so the page can move focus to the group
 * when it is the first invalid field.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.name Shared `name` that makes the radios exclusive.
 * @param {string} props.legend
 * @param {Array<{ value: string, label: string, description?: string }>} props.options
 * @param {string} props.value
 * @param {(event: React.ChangeEvent<HTMLInputElement>) => void} props.onChange
 */
export default function RadioGroup({
  id,
  name,
  legend,
  options,
  value,
  onChange,
  helperText,
  error,
  required = false,
  inputRef,
}) {
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <fieldset
      className={['radio-group', error ? 'radio-group--invalid' : ''].filter(Boolean).join(' ')}
      aria-describedby={describedBy || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="radio-group__legend">
        {legend}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </legend>

      <div className="radio-group__options">
        {options.map((option, index) => {
          const optionId = `${id}-${option.value}`;
          return (
            <label
              key={option.value}
              className={[
                'radio-option',
                value === option.value ? 'radio-option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              htmlFor={optionId}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={onChange}
                ref={index === 0 ? inputRef : undefined}
                className="radio-option__input"
              />
              <span className="radio-option__text">
                <span className="radio-option__label">{option.label}</span>
                {option.description && (
                  <span className="radio-option__description">{option.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

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
    </fieldset>
  );
}
