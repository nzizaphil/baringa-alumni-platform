import { useId, useState } from 'react';

import {
  createPost,
  MAX_POST_LENGTH,
  POST_LENGTH_WARNING_THRESHOLD,
} from '../api/posts.js';
import Button from './Button.jsx';
import FormField from './FormField.jsx';
import Toast from './Toast.jsx';

/**
 * The post composer (`POST-1`), following the three F08 prototypes:
 * `07-BaringaAlumni - F08.1 Create P.html` for the default,
 * `08-...F08.3...` for the invalid state and `09-...F08.4...` for the success
 * toast.
 *
 * Departures from the prototypes, all deliberate:
 *
 * - **In the feed, not on its own screen.** F08 draws a full-page Create post
 *   form reached from the feed. The ticket asks for the composer above the
 *   list, which is also what F07.2's own composer card does; the card's heading
 *   and framing are kept so it still reads as the same component.
 * - **No visibility control.** F08 draws Public / Members only. The server
 *   stores every post as `members_only` in this phase and ignores a visibility
 *   sent with the request, so offering the choice would be offering one that is
 *   silently discarded. The helper text below the field says what the setting
 *   actually is rather than leaving it unstated.
 * - **No Cancel.** There is nothing to navigate back to and nothing to discard
 *   that clearing the box does not already do.
 *
 * @param {object} props
 * @param {(post: object) => void} props.onPosted Called with the created post
 *   so the feed can put it at the top without refetching.
 */
export default function PostComposer({ onPosted }) {
  const fieldId = useId();

  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const trimmed = body.trim();
  const length = body.length;

  const isEmpty = trimmed.length === 0;
  const isOverLimit = length > MAX_POST_LENGTH;
  const isNearLimit = length >= POST_LENGTH_WARNING_THRESHOLD;

  /*
   * Submission is blocked past the limit and while a request is out, but *not*
   * for an empty box. An empty submit is how a member finds out the field is
   * required: a permanently disabled button gives no reason and nothing to
   * click, so the click is accepted and answered with the message F08.3 draws.
   */
  const isBlocked = isOverLimit;

  const counterTone = isOverLimit
    ? 'text-danger-text'
    : isNearLimit
      ? 'text-warning-text'
      : 'text-secondary-text';

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting || isBlocked) return;

    // Checked here rather than by disabling the control, so nothing is sent and
    // the member is told why. F08.3's wording.
    if (isEmpty) {
      setError('Post content cannot be empty');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { post } = await createPost(trimmed);

      setBody('');
      setShowSuccess(true);
      onPosted?.(post);
    } catch (requestError) {
      /*
       * A 422 carries field-level `errors`; the server names the field `body`,
       * which is this field. Anything else - a 403 from an account that has
       * been suspended mid-session, a network fault - has no field to attach
       * to, so its message is shown in the same place rather than swallowed.
       */
      const fieldError = requestError?.errors?.find((item) => item.field === 'body');

      setError(
        fieldError?.message ||
          requestError?.message ||
          'Your post could not be published. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {showSuccess && (
        <Toast variant="success" onDismiss={() => setShowSuccess(false)}>
          Your post has been published
        </Toast>
      )}

      <section
        className="rounded-card border border-border-light bg-white p-5 shadow-sm md:p-6"
        aria-labelledby={`${fieldId}-heading`}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary bg-opacity-10">
            <i className="fa-solid fa-pen-to-square text-20 text-primary" aria-hidden="true" />
          </div>
          <h2 id={`${fieldId}-heading`} className="text-20 font-semibold text-near-black">
            Create post
          </h2>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <FormField
            multiline
            rows={6}
            id={fieldId}
            label="What's on your mind?"
            placeholder="Share a professional update..."
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              // Clear the message as soon as the member acts on it, rather than
              // leaving a stale complaint beside a box they have since filled.
              if (error) setError(null);
            }}
            error={error ?? undefined}
            disabled={isSubmitting}
            helperText="Visible to approved members of the alumni community."
            /*
             * Deliberately no `maxLength`: the browser would silently swallow
             * the 2001st character, leaving a member who pasted a long update
             * with no idea why the end of it vanished. Letting the text exceed
             * the limit is what gives the counter something to warn about and
             * the button a reason to refuse.
             */
            labelAdornment={
              /*
               * The counter is `aria-live` so the warning is announced as it is
               * crossed, not only discovered on submit - but `polite`, so it
               * waits for a pause instead of interrupting every keystroke.
               */
              <span className={`text-12 ${counterTone}`} aria-live="polite">
                {length} / {MAX_POST_LENGTH}
                {isOverLimit && (
                  <span className="sr-only"> — over the limit, shorten your post to publish</span>
                )}
              </span>
            }
          />

          <div className="flex items-center justify-end gap-4 border-t border-border-light pt-4">
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isBlocked}
              className="h-11 px-8 text-14"
            >
              {isSubmitting ? 'Publishing…' : 'Post'}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
