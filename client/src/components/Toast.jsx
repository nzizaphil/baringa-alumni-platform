import { useEffect } from 'react';

const VARIANTS = {
  success: {
    border: 'border-success',
    tint: 'bg-success bg-opacity-10',
    icon: 'fa-check text-success',
    text: 'text-success-text',
  },
  error: {
    border: 'border-danger',
    tint: 'bg-danger bg-opacity-10',
    icon: 'fa-circle-exclamation text-danger',
    text: 'text-danger-text',
  },
  warning: {
    border: 'border-warning',
    tint: 'bg-warning bg-opacity-10',
    icon: 'fa-circle-info text-warning',
    text: 'text-warning-text',
  },
};

/** How long a toast stays before dismissing itself. */
const DEFAULT_DURATION_MS = 6000;

/**
 * Toast
 *
 * The confirmation strip from the review prototype
 * (`docs/prototype/15-BaringaAlumni - F18.4 Registra.html`): pinned top-right,
 * white, with a 4px coloured left edge, an icon disc and a dismiss control.
 *
 * Distinct from `Alert`, which sits *in* the page beside the thing it describes
 * and stays until the state that produced it changes. A toast reports something
 * that has already finished on a screen the user has since moved on from - an
 * approval confirmed after the dashboard has reloaded - so it floats and it
 * expires.
 *
 * `role="status"` rather than `alert`: this is the good news arriving, and
 * interrupting a screen reader mid-sentence to announce it would be worse
 * manners than waiting. Errors passed here are still polite for the same
 * reason - the failure was already reported on the screen the user was looking
 * at when it happened.
 *
 * @param {object} props
 * @param {'success'|'error'|'warning'} [props.variant='success']
 * @param {string} props.children The message.
 * @param {() => void} props.onDismiss
 * @param {number} [props.duration=6000] Milliseconds before it dismisses
 *   itself; pass 0 to leave it until dismissed by hand.
 */
export default function Toast({
  variant = 'success',
  duration = DEFAULT_DURATION_MS,
  onDismiss,
  children,
}) {
  const tokens = VARIANTS[variant] ?? VARIANTS.success;

  useEffect(() => {
    if (!duration || !onDismiss) return undefined;

    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      className={`fixed right-6 top-6 z-[60] flex w-[calc(100%-3rem)] max-w-[400px] items-center justify-between gap-3 rounded-card border-l-4 bg-white p-4 shadow-lg ${tokens.border}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tokens.tint}`}>
          <i className={`fa-solid ${tokens.icon} text-14`} aria-hidden="true" />
        </div>
        <p className={`text-14 font-semibold ${tokens.text}`}>{children}</p>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          // -m-2 pulls the 44px target back inside the toast's 16px padding.
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-button text-secondary-text hover:text-near-black focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30"
          aria-label="Dismiss this message"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
