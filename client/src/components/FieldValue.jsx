import { NOT_PROVIDED, isMissing } from '../format/registration.js';

/**
 * FieldValue
 *
 * One declared detail, or a dash where the applicant declared nothing.
 *
 * A lecturer has no student number and a current student has no graduation
 * year, so blanks are ordinary here rather than exceptional. The dash is
 * hidden from assistive tech and replaced with "Not provided", because an em
 * dash is announced as anything from "dash" to silence depending on the
 * screen reader - and a silent cell reads as a missing *field*, not a missing
 * *value*.
 */
export default function FieldValue({ value, className = '' }) {
  if (isMissing(value)) {
    return (
      <span className={`text-secondary-text ${className}`}>
        <span aria-hidden="true">{NOT_PROVIDED}</span>
        <span className="sr-only">Not provided</span>
      </span>
    );
  }

  return <span className={className}>{value}</span>;
}
