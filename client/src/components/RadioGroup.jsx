/**
 * RadioGroup
 *
 * A set of mutually exclusive choices laid out as bordered option cards, one
 * column on small screens and two from `md` up, following the prototype's
 * association picker. The selected card takes a violet border, a 5% violet
 * tint and a semibold label.
 *
 * The options sit in a fieldset so the legend labels every radio, with the
 * helper and error bound to the group through `aria-describedby` — the group,
 * not an individual radio, is what fails validation.
 *
 * The first radio carries `inputRef` so the page can move focus to the group
 * when it is the first invalid field.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.name Shared `name` that makes the radios exclusive.
 * @param {string} props.legend
 * @param {Array<{ value: string, label: string }>} props.options
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
      className="space-y-3"
      aria-describedby={describedBy || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="text-14 font-semibold text-near-black">
        {legend}
        {required && (
          <span className="text-danger-text" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </legend>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.map((option, index) => {
          const optionId = `${id}-${option.value}`;
          const isSelected = value === option.value;

          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={[
                'flex cursor-pointer items-center gap-3 rounded-input p-3 transition-colors',
                isSelected
                  ? 'border border-primary bg-primary bg-opacity-5'
                  : error
                    ? 'border border-danger hover:bg-bg-page'
                    : 'border border-border-light hover:bg-bg-page',
              ].join(' ')}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={isSelected}
                onChange={onChange}
                ref={index === 0 ? inputRef : undefined}
                className="h-4 w-4 accent-primary focus:ring-primary"
              />
              <span
                className={`text-14 text-near-black ${isSelected ? 'font-semibold' : ''}`}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>

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
    </fieldset>
  );
}
