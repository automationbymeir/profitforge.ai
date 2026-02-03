/**
 * Type Guards and Runtime Validation
 * Provides type-safe validation with proper TypeScript narrowing
 */

/**
 * Type guard to check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard to check if a value is a valid UUID
 */
export function isValidUUID(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Type guard to check if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard to check if a value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return isNumber(value) && value > 0 && Number.isInteger(value);
}

/**
 * Type guard for File objects (FormData)
 */
export function isFile(value: unknown): value is File {
  return (
    value instanceof File ||
    (typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      'size' in value &&
      'type' in value)
  );
}

/**
 * Type guard to check if error has a status code property
 */
export function hasStatusCode(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  );
}

/**
 * Type guard to check if error has a code property
 */
export function hasErrorCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * Validate and extract string from FormData
 */
export function getFormDataString(
  formData: FormData | Map<string, unknown>,
  key: string
): string | null {
  const value = formData.get(key);
  return isNonEmptyString(value) ? value : null;
}

/**
 * Validate and extract File from FormData
 */
export function getFormDataFile(
  formData: FormData | Map<string, unknown>,
  key: string
): File | null {
  const value = formData.get(key);
  return isFile(value) ? value : null;
}

/**
 * Assert that a value is defined (throws if null/undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string = 'Value is required'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Check if an error is a transient database error that should be retried
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const errorCode = hasErrorCode(error) ? error.code : undefined;
  const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';

  const transientCodes = ['ESOCKET', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'];
  const transientKeywords = ['timeout', 'connection'];

  return (
    (errorCode !== undefined && transientCodes.includes(errorCode)) ||
    transientKeywords.some((keyword) => errorMsg.includes(keyword))
  );
}

/**
 * Safe JSON parse with type validation
 */
export function safeJSONParse<T = unknown>(
  json: string,
  validator?: (value: unknown) => value is T
): T | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (validator) {
      return validator(parsed) ? parsed : null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}
