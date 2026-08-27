/**
 * Sign-in rules.
 *
 * Deliberately thin. These catch an empty submit before a pointless round
 * trip; they say nothing about whether the credentials are *right*. Only the
 * server can answer that, and it answers with one message for both a wrong
 * password and an unknown email - so nothing here may ever look at the email
 * and offer a more specific opinion.
 */

/** Order used to decide which invalid field receives focus first. */
export const FIELD_ORDER = ['email', 'password'];

export const EMPTY_VALUES = {
  email: '',
  password: '',
};

/**
 * @param {typeof EMPTY_VALUES} values
 * @returns {Record<string, string>} Field name to message; empty when valid.
 */
export function validate(values) {
  const errors = {};

  if (!values.email.trim()) {
    errors.email = 'Enter your email address.';
  }

  // Not trimmed: leading or trailing spaces are legitimate password
  // characters, and the server is the one that decides whether it matches.
  if (!values.password) {
    errors.password = 'Enter your password.';
  }

  return errors;
}

/**
 * Builds the request body.
 *
 * The email is trimmed and lower-cased to match how the server's validator
 * normalises it before the lookup; the password is sent exactly as typed.
 *
 * @param {typeof EMPTY_VALUES} values
 */
export function buildPayload(values) {
  return {
    email: values.email.trim().toLowerCase(),
    password: values.password,
  };
}
