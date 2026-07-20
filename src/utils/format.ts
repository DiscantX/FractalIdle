// Shared, display-layer-only truncation for long coordinates. Coordinates are
// always stored at full precision; this only affects how they're shown (the
// collapsed nav-card summary line, saved-location list rows, etc.). The same
// principle as formatCoord in ui-manager.ts — truncation never touches storage.
//
// Truncate per numeric field, head + ellipsis + tail, rather than truncating a
// composed string: many nearby points share leading digits, so a whole-string
// cut risks dropping the Zoom field entirely.
//
// e.g. truncateNumericString("-0.74362819", 5, 3) => "-0.74…819"
export function truncateNumericString(
  value: string,
  headLen = 5,
  tailLen = 3,
): string {
  if (value.length <= headLen + tailLen + 1) {
    return value;
  }
  return `${value.slice(0, headLen)}…${value.slice(-tailLen)}`;
}
