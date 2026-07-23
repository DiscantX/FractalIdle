// Estimates how many significant decimal digits are needed to resolve
// individual pixels at a given zoom level. Feeds selectPrecisionBackend's
// 'auto' tier boundaries — see select.ts.
//
// digits ≈ log10(zoom)                [how deep we are]
//        + log10(canvasWidthPixels)   [pixel-to-pixel resolution within that]
//        + safety margin              [accumulated error across many chained
//                                       ops in one reference orbit — same
//                                       category of margin as
//                                       DOUBLE_DOUBLE_MAX_DIGITS's -1 in
//                                       select.ts, just not yet measured for
//                                       this specific accumulation. Treat as
//                                       a placeholder pending real data, not
//                                       a derived constant.]
const ACCUMULATION_SAFETY_MARGIN_DIGITS = 6;

export function digitsForZoom(zoom: number, canvasWidthPixels: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    // zoom is already Infinity/0/NaN here — the float64 camera storage
    // (state.view.zoom) overflowed/underflowed before this function was
    // called. This is the same root problem as the scaleRe/scaleIm
    // underflow and the centerRe/centerIm precision loss noted elsewhere —
    // all three stem from ViewState being plain float64. Real fix is the
    // deferred camera-storage migration (zoom likely needs a DIFFERENT fix
    // than coordinates: wider exponent range, not more significant digits —
    // e.g. storing/operating on log10(zoom) instead of zoom directly).
    throw new Error(
      `digitsForZoom: zoom must be a positive finite number, got ${zoom}. ` +
      `This means the camera's float64 zoom has already overflowed/underflowed — ` +
      `see the camera-storage migration notes.`
    );
  }
  const zoomDigits = Math.max(0, Math.log10(zoom));
  const widthDigits = Math.max(0, Math.log10(Math.max(1, canvasWidthPixels)));
  return Math.ceil(zoomDigits + widthDigits) + ACCUMULATION_SAFETY_MARGIN_DIGITS;
}