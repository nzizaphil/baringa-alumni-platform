import { ASSOCIATION_TYPES } from '../api/auth.js';

/**
 * Registration rules, mirrored from the server.
 *
 * These run before the request so the applicant gets an immediate answer, but
 * the server stays authoritative: whatever it returns in the failure
 * envelope's `errors` array overwrites anything decided here.
 */

/** Order used to decide which invalid field receives focus first. */
export const FIELD_ORDER = [
  'name',
  'email',
  'password',
  'associationType',
  'studentNumber',
  'graduationYear',
];

export const EMPTY_VALUES = {
  name: '',
  email: '',
  password: '',
  associationType: '',
  studentNumber: '',
  graduationYear: '',
};

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 120;
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const EARLIEST_GRADUATION_YEAR = 1900;
export const CURRENT_YEAR = new Date().getFullYear();

// Deliberately permissive: this only catches the obvious typos before a round
// trip; the server decides what it actually accepts.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_STUDENT_NUMBER_LENGTH = 32;

/** A student number applies to anyone who studied here, past or present. */
export function requiresStudentNumber(associationType) {
  return (
    associationType === ASSOCIATION_TYPES.CURRENT_STUDENT ||
    associationType === ASSOCIATION_TYPES.FORMER_STUDENT
  );
}

/** Only someone who has finished studying has a graduation year to give. */
export function requiresGraduationYear(associationType) {
  return associationType === ASSOCIATION_TYPES.FORMER_STUDENT;
}

/**
 * @param {typeof EMPTY_VALUES} values
 * @returns {Record<string, string>} Field name to message; empty when valid.
 */
export function validate(values) {
  const errors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = 'Enter your full name.';
  } else if (name.length < MIN_NAME_LENGTH) {
    errors.name = `Your name must be at least ${MIN_NAME_LENGTH} characters.`;
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Your name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (email.length > MAX_EMAIL_LENGTH) {
    errors.email = `Your email address must be ${MAX_EMAIL_LENGTH} characters or fewer.`;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address, for example name@example.com.';
  }

  if (!values.password) {
    errors.password = 'Choose a password.';
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (values.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `Your password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  } else if (!/[A-Za-z]/.test(values.password)) {
    errors.password = 'Your password must contain at least one letter.';
  } else if (!/\d/.test(values.password)) {
    errors.password = 'Your password must contain at least one number.';
  }

  if (!values.associationType) {
    errors.associationType = 'Select your association with the university.';
  }

  if (requiresStudentNumber(values.associationType)) {
    const studentNumber = values.studentNumber.trim();
    if (!studentNumber) {
      errors.studentNumber = 'Enter your student number.';
    } else if (studentNumber.length > MAX_STUDENT_NUMBER_LENGTH) {
      errors.studentNumber = `Your student number must be ${MAX_STUDENT_NUMBER_LENGTH} characters or fewer.`;
    }
  }

  if (requiresGraduationYear(values.associationType)) {
    const graduationYear = values.graduationYear.trim();
    if (!graduationYear) {
      errors.graduationYear = 'Enter the year you graduated.';
    } else if (!/^\d{4}$/.test(graduationYear)) {
      errors.graduationYear = 'Enter a four-digit year, for example 2019.';
    } else {
      const year = Number(graduationYear);
      if (year < EARLIEST_GRADUATION_YEAR || year > CURRENT_YEAR) {
        errors.graduationYear = `Enter a year between ${EARLIEST_GRADUATION_YEAR} and ${CURRENT_YEAR}.`;
      }
    }
  }

  return errors;
}

/**
 * Builds the request body, omitting the fields the association hides.
 *
 * The form state calls this field `associationType`, but the API reads it as
 * `association` (see `body('association')` in the server's registerValidator),
 * so the wire name is applied here. `mapServerErrors` translates back.
 */
export function buildPayload(values) {
  const payload = {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    association: values.associationType,
  };

  if (requiresStudentNumber(values.associationType)) {
    payload.studentNumber = values.studentNumber.trim();
  }

  if (requiresGraduationYear(values.associationType)) {
    payload.graduationYear = Number(values.graduationYear.trim());
  }

  return payload;
}

// The server may name a field in snake_case, or path-qualify it as
// `body.email`; either way it has to land on the control the user can see.
const SERVER_FIELD_ALIASES = {
  full_name: 'name',
  fullname: 'name',
  association: 'associationType',
  association_type: 'associationType',
  associationtype: 'associationType',
  student_number: 'studentNumber',
  studentnumber: 'studentNumber',
  graduation_year: 'graduationYear',
  graduationyear: 'graduationYear',
};

/** Resolves a server-reported field name to one of this form's controls. */
export function toFormField(rawField) {
  if (!rawField) return null;

  const leaf = String(rawField).split('.').pop();
  if (FIELD_ORDER.includes(leaf)) return leaf;

  const normalised = leaf.toLowerCase();
  if (SERVER_FIELD_ALIASES[normalised]) return SERVER_FIELD_ALIASES[normalised];

  const camelCased = normalised.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return FIELD_ORDER.includes(camelCased) ? camelCased : null;
}

/**
 * Splits the server's `errors` array into messages that belong to a control
 * and messages that do not, so nothing the server said is silently dropped.
 *
 * @param {Array<{ field?: string, message?: string }>} serverErrors
 * @returns {{ fieldErrors: Record<string, string>, unmatched: string[] }}
 */
export function mapServerErrors(serverErrors = []) {
  const fieldErrors = {};
  const unmatched = [];

  for (const entry of serverErrors) {
    const message = entry?.message || entry?.msg;
    if (!message) continue;

    const field = toFormField(entry?.field ?? entry?.path ?? entry?.param);
    // First message per field wins; a later one would overwrite it unseen.
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = message;
    } else if (!field) {
      unmatched.push(message);
    }
  }

  return { fieldErrors, unmatched };
}
