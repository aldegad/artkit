/**
 * Recursively removes `undefined` values from an object before writing to Firestore.
 * Preserves Date and Firestore Timestamp-like objects as-is.
 */
export function removeUndefinedValues<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  const maybeTimestamp = value as { toMillis?: () => number };
  if (typeof maybeTimestamp.toMillis === "function") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedValues(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry !== undefined) {
      result[key] = removeUndefinedValues(entry);
    }
  }
  return result as T;
}

/**
 * Reads Firestore timestamp values from multiple shapes and returns epoch ms.
 * Supports:
 * - number (already ms)
 * - Firestore Timestamp-like ({ toMillis() })
 * - serialized object ({seconds,nanoseconds} / {_seconds,_nanoseconds})
 */
export function readTimestampMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const maybeTimestamp = value as { toMillis?: () => number } | undefined;
  if (maybeTimestamp && typeof maybeTimestamp.toMillis === "function") {
    return maybeTimestamp.toMillis();
  }

  const asRecord = value as
    | {
        seconds?: unknown;
        nanoseconds?: unknown;
        _seconds?: unknown;
        _nanoseconds?: unknown;
      }
    | undefined;

  const seconds =
    typeof asRecord?.seconds === "number"
      ? asRecord.seconds
      : typeof asRecord?._seconds === "number"
      ? asRecord._seconds
      : null;

  const nanoseconds =
    typeof asRecord?.nanoseconds === "number"
      ? asRecord.nanoseconds
      : typeof asRecord?._nanoseconds === "number"
      ? asRecord._nanoseconds
      : 0;

  if (seconds !== null && Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
    return Math.floor(seconds * 1000 + nanoseconds / 1_000_000);
  }

  return Date.now();
}
