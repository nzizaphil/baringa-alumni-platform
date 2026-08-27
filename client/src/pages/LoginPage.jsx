import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { INVALID_CREDENTIALS_MESSAGE, USER_STATUS } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import FormField from '../components/FormField.jsx';
import PageLayout from '../components/PageLayout.jsx';
import useAuth from '../hooks/useAuth.js';
import { buildPayload, EMPTY_VALUES, FIELD_ORDER, validate } from '../validation/login.js';

/** Where a member lands once signed in, decided by account status. */
const DESTINATION_BY_STATUS = {
  [USER_STATUS.APPROVED]: '/feed',
  [USER_STATUS.PENDING]: '/pending',
};

/*
 * Decision #42: password reset is not in this release. The prototype's
 * "Forgot password?" affordance stays on screen - removing it would quietly
 * change the design - but it is inert: rendered as a span rather than an
 * anchor, so there is no href to follow, nothing in the tab order and no
 * navigation to make, with `aria-disabled` and a short explanation carrying
 * the reason to anyone who cannot see that it is greyed out.
 */
const FORGOT_PASSWORD_HELP_ID = 'forgot-password-help';

function ForgotPasswordLink() {
  return (
    <span
      id="forgot-password"
      aria-disabled="true"
      aria-describedby={FORGOT_PASSWORD_HELP_ID}
      className="cursor-not-allowed text-12 font-semibold text-secondary-text"
    >
      Forgot password?
    </span>
  );
}

/**
 * Sign-in screen (AUTH-4).
 *
 * Follows docs/prototype/03-BaringaAlumni - F05.1 Login —.html for the default
 * state and 04-...F05.3 Login —.html for the error state: a centred 450px card
 * - narrower than the 600px registration card - with the failure drawn as a
 * banner above the heading.
 *
 * That banner shows whatever the server said about a 401, and nothing more
 * specific. The server answers a wrong password and an unknown email with the
 * same message on purpose, so the screen must not add a client-side guess that
 * would tell an attacker which addresses are registered.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fieldRefs = useRef({});

  const registerRef = useCallback(
    (field) => (element) => {
      fieldRefs.current[field] = element;
    },
    []
  );

  /** Moves focus to the first field, in visual order, that has an error. */
  const focusFirstInvalid = useCallback((fieldErrors) => {
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!firstInvalid) return;

    const element = fieldRefs.current[firstInvalid];
    if (!element || element.disabled) return;

    element.focus();
    element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
  };

  const handleFailure = (error) => {
    if (!(error instanceof ApiError)) {
      setFormError('Something went wrong while signing you in. Please try again.');
      return;
    }

    if (error.status === 401) {
      /*
       * The one case the prototype's error state draws. `error.message` is the
       * server's own wording - the same string whether the password was wrong
       * or the address has never been registered - and it is shown verbatim.
       *
       * Both fields are outlined but given no message of their own, matching
       * the prototype's two red borders and single banner. A per-field message
       * here is what would leak which half was wrong, so `true` is a flag
       * rather than text: LoginPage only ever renders a *string* error.
       */
      setFormError(error.message || INVALID_CREDENTIALS_MESSAGE);
      setErrors({ email: true, password: true });
      focusFirstInvalid({ email: true });
      return;
    }

    if (error.isNetworkError) {
      setFormError(error.message);
      return;
    }

    // A 422 from the login validator, or anything else the server chose to
    // say. Field-level detail is shown against the field it names.
    const fieldErrors = {};
    for (const detail of error.errors) {
      if (detail?.field && detail.field in EMPTY_VALUES && !fieldErrors[detail.field]) {
        fieldErrors[detail.field] = detail.message;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
    }

    setFormError(error.message || 'Something went wrong while signing you in. Please try again.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError(null);

    const nextErrors = validate(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(nextErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await login(buildPayload(values));

      /*
       * Status decides the destination. A rejected account, and anything else
       * the server may add later, falls back to the pending screen rather than
       * into the member area; that screen reads the status itself and says
       * which of the two it is. `RequireAuth` applies the same rule to every
       * later navigation, so this is a shortcut to the right screen rather
       * than the thing enforcing it.
       */
      navigate(DESTINATION_BY_STATUS[user.status] ?? '/pending', { replace: true });
    } catch (error) {
      setIsSubmitting(false);
      handleFailure(error);
    }
  };

  return (
    <PageLayout>
      <section
        id="login-card"
        className="w-full max-w-[450px] rounded-card border border-border-light bg-white p-8 shadow-sm md:p-10"
        aria-labelledby="login-heading"
      >
        {formError && (
          <div className="mb-6">
            <Alert variant="error" title={formError} />
          </div>
        )}

        <div className="mb-8">
          <h1 id="login-heading" className="text-32 font-semibold text-near-black">
            Sign in
          </h1>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <FormField
            id="email"
            name="email"
            type="email"
            label="Email"
            placeholder="jane@example.com"
            autoComplete="email"
            value={values.email}
            onChange={handleChange}
            // A 401 marks the field invalid but carries no message of its
            // own: the banner is the only thing that explains the failure.
            error={typeof errors.email === 'string' ? errors.email : undefined}
            invalid={Boolean(errors.email)}
            required
            inputRef={registerRef('email')}
            disabled={isSubmitting}
          />

          <div className="space-y-2">
            <FormField
              id="password"
              name="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={values.password}
              onChange={handleChange}
              error={typeof errors.password === 'string' ? errors.password : undefined}
              invalid={Boolean(errors.password)}
              required
              inputRef={registerRef('password')}
              disabled={isSubmitting}
              labelAdornment={<ForgotPasswordLink />}
            />

            {/* Sits outside FormField so a field error cannot displace it:
                decision #42 asks for the explanation to be always present. */}
            <p id={FORGOT_PASSWORD_HELP_ID} className="text-12 text-secondary-text">
              Password reset is not available yet. Contact the alumni office if you cannot sign in.
            </p>
          </div>

          <div className="pt-2">
            <Button type="submit" variant="primary" fullWidth loading={isSubmitting}>
              {isSubmitting ? 'Signing you in…' : 'Sign in'}
            </Button>

            <div className="mt-4 text-center">
              <Link
                to="/register"
                className="text-14 font-semibold text-primary-text decoration-2 underline-offset-4 hover:underline"
              >
                Register as a member
              </Link>
            </div>
          </div>
        </form>
      </section>
    </PageLayout>
  );
}
