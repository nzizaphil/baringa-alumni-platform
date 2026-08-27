import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ASSOCIATION_TYPES, register } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import FormField from '../components/FormField.jsx';
import PageLayout from '../components/PageLayout.jsx';
import RadioGroup from '../components/RadioGroup.jsx';
import {
  buildPayload,
  CURRENT_YEAR,
  EARLIEST_GRADUATION_YEAR,
  EMPTY_VALUES,
  FIELD_ORDER,
  mapServerErrors,
  requiresGraduationYear,
  requiresStudentNumber,
  validate,
} from '../validation/register.js';

/*
 * The prototype's radio `value` attributes are placeholders (student,
 * graduate, lecturer_current, lecturer_former) and are not what the API
 * accepts. The values below come from ASSOCIATIONS in the server's User model,
 * which is the only correct source; only the labels are taken from the
 * prototype.
 */
const ASSOCIATION_OPTIONS = [
  { value: ASSOCIATION_TYPES.CURRENT_STUDENT, label: 'Current student' },
  { value: ASSOCIATION_TYPES.FORMER_STUDENT, label: 'Former student / graduate' },
  { value: ASSOCIATION_TYPES.CURRENT_LECTURER, label: 'Current lecturer' },
  { value: ASSOCIATION_TYPES.FORMER_LECTURER, label: 'Former lecturer' },
];

const PASSWORD_HELPER = 'At least 8 characters, including a letter and a number';

export default function RegisterPage() {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [status, setStatus] = useState('idle');
  const [submittedEmail, setSubmittedEmail] = useState('');

  const fieldRefs = useRef({});
  const isSubmitting = status === 'submitting';

  /*
   * Both conditional fields stay mounted at all times; the association decides
   * only whether they are enabled. A disabled field is greyed, excluded from
   * validation and left out of the request body.
   */
  const studentNumberEnabled = requiresStudentNumber(values.associationType);
  const graduationYearEnabled = requiresGraduationYear(values.associationType);

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
    // A disabled control cannot take focus, so skip it rather than trapping.
    if (!element || element.disabled) return;

    element.focus();
    element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setValues((previous) => {
      const next = { ...previous, [name]: value };

      // Switching association can disable a field; anything already typed
      // there is cleared so it cannot reach the request body.
      if (name === 'associationType') {
        if (!requiresStudentNumber(value)) next.studentNumber = '';
        if (!requiresGraduationYear(value)) next.graduationYear = '';
      }

      return next;
    });

    setErrors((previous) => {
      const next = { ...previous, [name]: undefined };
      if (name === 'associationType') {
        if (!requiresStudentNumber(value)) next.studentNumber = undefined;
        if (!requiresGraduationYear(value)) next.graduationYear = undefined;
      }
      return next;
    });
  };

  const handleFailure = (error) => {
    setStatus('idle');

    if (!(error instanceof ApiError)) {
      setFormError('Something went wrong while creating your account. Please try again.');
      return;
    }

    if (error.status === 409) {
      const message =
        'An account with this email address is already registered. Try signing in instead, ' +
        'or use a different email address.';
      setErrors((previous) => ({ ...previous, email: 'This email address is already registered.' }));
      setFormError(message);
      focusFirstInvalid({ email: true });
      return;
    }

    // 422 is the documented validation status; accept any failure that carries
    // field-level detail so a 400 is not thrown away.
    const { fieldErrors, unmatched } = mapServerErrors(error.errors);
    const hasFieldErrors = Object.keys(fieldErrors).length > 0;

    if (hasFieldErrors) {
      setErrors(fieldErrors);
      setFormError(
        unmatched.length > 0
          ? unmatched.join(' ')
          : 'Please correct the highlighted fields and submit again.'
      );
      focusFirstInvalid(fieldErrors);
      return;
    }

    setFormError(
      unmatched.length > 0
        ? unmatched.join(' ')
        : error.message || 'Something went wrong while creating your account. Please try again.'
    );
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

    setStatus('submitting');

    try {
      const payload = buildPayload(values);
      await register(payload);
      setSubmittedEmail(payload.email);
      setStatus('success');
    } catch (error) {
      handleFailure(error);
    }
  };

  if (status === 'success') {
    return (
      <PageLayout>
        <section
          className="w-full max-w-[600px] rounded-card border border-border-light bg-white p-8 shadow-sm md:p-10"
          aria-labelledby="registration-complete"
        >
          <h1 id="registration-complete" className="mb-2 text-32 font-semibold text-near-black">
            Registration received
          </h1>
          <p className="mb-8 text-16 text-secondary-text">
            Your registration is reviewed by an administrator before you can post.
          </p>

          <Alert variant="success" title="Pending administrator approval">
            <p>
              Thanks for registering. An administrator will review your association with Baringa
              University before your account is activated.
            </p>
            <p>
              We will notify {submittedEmail ? <strong>{submittedEmail}</strong> : 'you by email'}{' '}
              once your application has been reviewed. You will not be able to sign in until then.
            </p>
          </Alert>

          <div className="mt-8 text-center">
            <Link
              to="/login"
              className="text-14 font-semibold text-primary-text decoration-2 underline-offset-4 hover:underline"
            >
              Already approved? Sign in
            </Link>
          </div>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section
        id="register-card"
        className="w-full max-w-[600px] rounded-card border border-border-light bg-white p-8 shadow-sm md:p-10"
        aria-labelledby="register-heading"
      >
        <div className="mb-8">
          <h1 id="register-heading" className="mb-2 text-32 font-semibold text-near-black">
            Create your account
          </h1>
          <p className="text-16 text-secondary-text">
            Your registration is reviewed by an administrator before you can post.
          </p>
        </div>

        {formError && (
          <div className="mb-6">
            <Alert variant="error" title={formError} />
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <FormField
            id="name"
            name="name"
            label="Full name"
            placeholder="Jane Doe"
            autoComplete="name"
            value={values.name}
            onChange={handleChange}
            error={errors.name}
            required
            inputRef={registerRef('name')}
            disabled={isSubmitting}
          />

          <FormField
            id="email"
            name="email"
            type="email"
            label="Email"
            placeholder="jane@example.com"
            autoComplete="email"
            value={values.email}
            onChange={handleChange}
            error={errors.email}
            required
            inputRef={registerRef('email')}
            disabled={isSubmitting}
          />

          <FormField
            id="password"
            name="password"
            type="password"
            label="Password"
            placeholder="••••••••"
            autoComplete="new-password"
            helperText={PASSWORD_HELPER}
            value={values.password}
            onChange={handleChange}
            error={errors.password}
            required
            inputRef={registerRef('password')}
            disabled={isSubmitting}
          />

          <RadioGroup
            id="associationType"
            name="associationType"
            legend="I am a"
            options={ASSOCIATION_OPTIONS}
            value={values.associationType}
            onChange={handleChange}
            error={errors.associationType}
            required
            inputRef={registerRef('associationType')}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              id="studentNumber"
              name="studentNumber"
              label="Student number"
              placeholder="12345678"
              inputMode="numeric"
              autoComplete="off"
              helperText={
                studentNumberEnabled
                  ? 'The number on your student ID'
                  : 'Only applies to current and former students'
              }
              value={values.studentNumber}
              onChange={handleChange}
              error={errors.studentNumber}
              required={studentNumberEnabled}
              disabled={!studentNumberEnabled || isSubmitting}
              inputRef={registerRef('studentNumber')}
            />

            <FormField
              id="graduationYear"
              name="graduationYear"
              label="Graduation year"
              placeholder="YYYY"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              helperText={
                graduationYearEnabled
                  ? `Between ${EARLIEST_GRADUATION_YEAR} and ${CURRENT_YEAR}`
                  : 'Only applies to former students'
              }
              value={values.graduationYear}
              onChange={handleChange}
              error={errors.graduationYear}
              required={graduationYearEnabled}
              disabled={!graduationYearEnabled || isSubmitting}
              inputRef={registerRef('graduationYear')}
            />
          </div>

          <div className="pt-2">
            <Button type="submit" variant="primary" fullWidth loading={isSubmitting}>
              {isSubmitting ? 'Creating your account…' : 'Create account'}
            </Button>

            <div className="mt-4 text-center">
              <Link
                to="/login"
                className="text-14 font-semibold text-primary-text decoration-2 underline-offset-4 hover:underline"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </form>
      </section>
    </PageLayout>
  );
}
