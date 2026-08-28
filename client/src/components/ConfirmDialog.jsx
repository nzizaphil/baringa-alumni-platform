import { useEffect, useRef } from 'react';

import Button from './Button.jsx';

const VARIANTS = {
  success: { tint: 'bg-success bg-opacity-10', icon: 'fa-user-check text-success' },
  danger: { tint: 'bg-danger bg-opacity-10', icon: 'fa-user-xmark text-danger' },
};

/**
 * ConfirmDialog
 *
 * The modal from the review prototype
 * (`docs/prototype/14-BaringaAlumni - F18.1 Registra.html`): a 480px card over a
 * `rgba(17,24,39,0.5)` scrim, with an icon disc, a question, one line of
 * consequence, and Cancel / confirm side by side.
 *
 * It exists because approving and rejecting are both irreversible - the server
 * answers 409 to a second decision, by design - so neither may be one misclick
 * away. Cancel is the left-hand, secondary control and the one Escape and a
 * click on the scrim both reach, so the safe way out is the easy one.
 *
 * Focus moves to the confirming button on open and is restored to whatever
 * opened the dialog on close, and Tab is held inside while it is open: a dialog
 * that leaves focus behind it is one a keyboard user cannot answer.
 *
 * @param {object} props
 * @param {string} props.title The question, e.g. "Approve this registration?"
 * @param {string} props.description What will happen if they confirm.
 * @param {string} props.confirmLabel
 * @param {'success'|'danger'} [props.variant='success']
 * @param {boolean} [props.loading=false] Shown on the confirming button while
 *   the request is in flight; also holds the dialog open and blocks Cancel, so
 *   an in-flight decision cannot be abandoned half-made.
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  variant = 'success',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const tokens = VARIANTS[variant] ?? VARIANTS.success;
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    confirmRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      // Keep Tab inside the dialog: everything behind the scrim is inert.
      const focusable = dialogRef.current?.querySelectorAll('button:not([disabled])');
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Back to the button that opened this, not to the top of the document.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [loading, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-near-black bg-opacity-50 p-6"
      // A click on the scrim is a way out, but only where it is safe to take
      // one; a click that lands on the card itself must not close anything.
      onClick={() => !loading && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-[480px] overflow-hidden rounded-card bg-white p-8 text-center shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${tokens.tint}`}>
          <i className={`fa-solid ${tokens.icon} text-32`} aria-hidden="true" />
        </div>

        <h2 id="confirm-dialog-title" className="mb-2 text-24 font-semibold text-near-black">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="mb-8 text-16 text-secondary-text">
          {description}
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant={variant === 'danger' ? 'danger' : 'primary'}
            className={`flex-1 ${variant === 'success' ? 'bg-success hover:bg-success-text focus:ring-success' : ''}`}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
