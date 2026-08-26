import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ASSOCIATION_TYPES, register } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import FormField from '../components/FormField.jsx';
import RadioGroup from '../components/RadioGroup.jsx';
import {
  buildPayload,
  CURRENT_YEAR,
  EARLIEST_GRADUATION_YEAR,
  EMPTY_VALUES,
  FIELD_ORDER,
  mapServerErrors,
  MIN_PASSWORD_LENGTH,
  requiresGraduationYear,
  requiresStudentNumber,
  validate,
} from '../validation/register.js';

const ASSOCIATION_OPTIONS = [
  {
    value: ASSOCIATION_TYPES.CURRENT_STUDENT,
    label: 'Current student',
    description: 'Enrolled at Baringa University right now',
  },
  {
    value: ASSOCIATION_TYPES.FORMER_STUDENT,
    label: 'Former student',
    description: 'Graduated from or previously studied at Baringa',
  },
  {
    value: ASSOCIATION_TYPES.CURRENT_LECTURER,
    label: 'Current lecturer',
    description: 'Teaching at Baringa University right now',
  },
  {
    value: ASSOCIATION_TYPES.FORMER_LECTURER,
    label: 'Former lecturer',
    description: 'Previously taught at Baringa University',
  },
];

export default function RegisterPage() {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [status, setStatus] = useState('idle');
  const [submittedEmail, setSubmittedEmail] = useState('');

  const fieldRefs = useRef({});
  const isSubmitting = status === 'submitting';

  const showStudentNumber = requiresStudentNumber(values.associationType);
  const showGraduationYear = requiresGraduationYear(values.associationType);

  const registerRef = useCallback(
    (field) => (element) => {
      // A callback ref is also called with null on unmount, which keeps the
      // conditional fields from leaving a stale node behind.
      fieldRefs.current[field] = element;
    },
    []
  );

  /** Moves focus to the first field, in visual order, that has an error. */
  const focusFirstInvalid = useCallback((fieldErrors) => {
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!firstInvalid) return;

    const element = fieldRefs.current[firstInvalid];
    if (!element) return;

    element.focus();
    element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setValues((previous) => {
      const next = { ...previous, [name]: value };

      // Switching association hides fields; their values must not be
      // submitted, and their stale errors must not block the next submit.
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
      <main className="page">
        <section className="card card--narrow" aria-labelledby="registration-complete">
          <Alert variant="success" title="Registration received">
            <p>
              Thanks for registering. Your application is <strong>pending administrator
              approval</strong> — an administrator will review your association with Baringa
              University before your account is activated.
            </p>
            <p>
              We will notify {submittedEmail ? <strong>{submittedEmail}</strong> : 'you by email'}{' '}
              once your application has been reviewed. You will not be able to sign in until then.
            </p>
          </Alert>

          <h1 id="registration-complete" className="visually-hidden">
            Registration complete
          </h1>

          <p className="card__footnote">
            Already approved? <Link to="/login">Sign in to your account</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card" aria-labelledby="register-heading">
        <header className="card__header">
          <p className="card__eyebrow">Baringa University Alumni Platform</p>
          <h1 id="register-heading" className="card__title">
            Create your account
          </h1>
          <p className="card__subtitle">
            Tell us how you are associated with Baringa University. An administrator reviews every
            application before the account is activated.
          </p>
        </header>

        {formError && (
          <Alert variant="error" title="We could not complete your registration">
            <p>{formError}</p>
          </Alert>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <FormField
            id="name"
            name="name"
            label="Full name"
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
            label="Email address"
            autoComplete="email"
            helperText="Use the address you want approval notices sent to."
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
            autoComplete="new-password"
            helperText={`At least ${MIN_PASSWORD_LENGTH} characters, including a letter and a number.`}
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
            legend="Your association with the university"
            options={ASSOCIATION_OPTIONS}
            value={values.associationType}
            onChange={handleChange}
            error={errors.associationType}
            required
            inputRef={registerRef('associationType')}
          />

          {showStudentNumber && (
            <FormField
              id="studentNumber"
              name="studentNumber"
              label="Student number"
              inputMode="numeric"
              autoComplete="off"
              helperText="The number on your student ID, for example 09876543."
              value={values.studentNumber}
              onChange={handleChange}
              error={errors.studentNumber}
              required
              inputRef={registerRef('studentNumber')}
              disabled={isSubmitting}
            />
          )}

          {showGraduationYear && (
            <FormField
              id="graduationYear"
              name="graduationYear"
              label="Graduation year"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              helperText={`The year you completed your studies, between ${EARLIEST_GRADUATION_YEAR} and ${CURRENT_YEAR}.`}
              value={values.graduationYear}
              onChange={handleChange}
              error={errors.graduationYear}
              required
              inputRef={registerRef('graduationYear')}
              disabled={isSubmitting}
            />
          )}

          <Button type="submit" variant="primary" fullWidth loading={isSubmitting}>
            {isSubmitting ? 'Creating your account…' : 'Create account'}
          </Button>
        </form>

        <p className="card__footnote">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
