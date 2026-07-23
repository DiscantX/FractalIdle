import { canvas } from './ui/dom';
import { settingsEngine } from './settings/instance';
import { requestRender, cancelActiveRender, warmPool, renderCallbacks, promoteActiveRenderToPresent } from './services/renderer';
import { zoomCallbacks } from './services/zoom-manager';
import { loadSavedLogs, appendRenderLog, loggerCallbacks, enableLogging } from './services/logger';
import { installDebugTools } from './utils/debug';
import { bigIntFixedBackend } from './core/precision/bigint-fixed';
import { decimalJsBackend } from './core/precision/decimal-js';
import { doubleDoubleBackend } from './core/precision/double-double';
import { selectPrecisionBackend } from './core/precision/select';
import { digitsForZoom } from './core/precision/digits-for-zoom';
import {
  wireControls,
  mountSettings,
  syncCanvasSize,
  updateStats,
  updateRenderStatus,
  updateLogCountText,
  updateNavigatorReadout,
} from './ui/ui-manager';

// Link renderer callbacks to UI updates and frame caching
renderCallbacks.onRenderStart = () => {
  updateRenderStatus(true);
};

renderCallbacks.onRenderComplete = () => {
  appendRenderLog();
  updateStats();
  updateRenderStatus(false);
};

renderCallbacks.onRenderCancel = () => {
  updateRenderStatus(false);
};

// Link zoom actions to rendering lifecycle
zoomCallbacks.onZoomStart = () => {
  cancelActiveRender();
  // Optional: overlap any pool (re)build with the zoom animation. Safe to skip —
  // renderFrame ensures the pool regardless (see warmWorkersOnZoom setting).
  if (settingsEngine.getValue('warmWorkersOnZoom') as boolean) {
    warmPool();
  }
};

zoomCallbacks.onZoomChange = (focalX, focalY) => {
  requestRender(focalX, focalY);
};

// Start a background render of the smooth-zoom destination *during* the
// animation so its tiles are cached by the time it lands. It also pre-caches the
// look-ahead and look-behind levels on spare worker capacity (spaced on this
// gesture's step factor). The render does not paint — the animation keeps the
// screen — and onZoomEnd promotes it once the gesture ends.
zoomCallbacks.onZoomTargetChange = (view, stepFactor, focalX, focalY) => {
  if (view) {
    requestRender(focalX, focalY, { view, present: false, stepFactor });
  }
};

// Present the destination render that was started during the animation, adopting
// the in-flight render rather than discarding it. If it already completed, a
// normal render presents the now-cached frame immediately.
zoomCallbacks.onZoomEnd = (focalX, focalY) => {
  if (!promoteActiveRenderToPresent()) {
    requestRender(focalX, focalY);
  }
};

// Keep the navigator's coordinate read-out in sync with the live view on every
// view change (smooth-zoom frames, instant zooms, jumps, resets), not only when
// a render finishes.
zoomCallbacks.onViewUpdate = () => {
  updateNavigatorReadout(true);
};

// Link log persistence events to UI counters
loggerCallbacks.onLogUpdate = (count) => {
  updateLogCountText(count);
};

// Bootstrap the application
function init() {
  installDebugTools();
  // Render logging is off by default (it re-serializes the whole log to
  // localStorage on every completed render — a real cost during a deep dive).
  // Turn it on from the console when needed: `enableRenderLogging()` then reload.
  (window as unknown as { enableRenderLogging: () => void }).enableRenderLogging = enableLogging;
  // Create the worker pool as early as possible so its module-load cost happens
  // during startup, off the critical path of the first render below.
  warmPool();
// // --- SCRATCH: bigint-fixed sanity check, remove after verifying ---

  // {
  //   console.log('auto @ 10 digits (expect null):', selectPrecisionBackend(10, 'auto'));
  //   console.log('auto @ 20 digits (expect double-double instance):', selectPrecisionBackend(20, 'auto'));
  //   console.log('auto @ 50 digits (expect decimal.js instance):', selectPrecisionBackend(50, 'auto'));
  //   console.log('forced bigint-fixed @ 10 digits (expect bigint-fixed anyway):', selectPrecisionBackend(10, 'bigint-fixed'));
  // }

  // {
  //   console.log('digitsForZoom(1, 1280):', digitsForZoom(1, 1280));       // small — should land in float64 tier
  //   console.log('digitsForZoom(1e16, 1280):', digitsForZoom(1e16, 1280)); // just past float64's real wall
  //   console.log('digitsForZoom(1e50, 1280):', digitsForZoom(1e50, 1280)); // deep — should land in decimal.js tier
  //   console.log('digitsForZoom(1e100, 1280):', digitsForZoom(1e100, 1280)); // deep — should land in decimal.js tier
  //   console.log('digitsForZoom(1e200, 1280):', digitsForZoom(1e350, 1280)); // deep — should land in decimal.js tier

  // }

//   {
//     const backend = bigIntFixedBackend(20); // 20 digits — arbitrary for this check
//     const a = backend.fromString('0.1');
//     const b = backend.fromString('0.2');

//     console.log('0.1 + 0.2 (float64):', 0.1 + 0.2);
//     console.log('0.1 + 0.2 (fixed):', a.add(b).toNumber());

//     const two = backend.fromString('2');
//     const three = backend.fromString('3');
//     console.log('2 * 3 (fixed):', two.mul(three).toNumber());

//     const negOne = backend.fromString('-1.5');
//     const half = backend.fromString('0.5');
//     console.log('-1.5 + 0.5 (fixed):', negOne.add(half).toNumber());
//     console.log('-1.5 * 0.5 (fixed):', negOne.mul(half).toNumber());

//     // Repeated multiplication — checks for the truncating-division drift
//     // roundedDiv exists to prevent. 0.1 multiplied by itself 20 times should
//     // land very close to 1e-20, not measurably off from it.
//     let acc = backend.fromString('0.1');
//     const oneTenth = backend.fromString('0.1');
//     for (let i = 0; i < 19; i++) acc = acc.mul(oneTenth) as typeof acc;
//     console.log('0.1^20 (fixed):', acc.toNumber(), 'vs Math.pow:', Math.pow(0.1, 20));

//     // The actual point of this whole exercise: distinguishing two values
//     // closer together than float64 can represent. These two strings differ
//     // only in their 20th digit — float64 could never tell them apart.
//     const deepBackend = bigIntFixedBackend(25);
//     const near1c = deepBackend.fromString('0.10000000000000000001');
//     const near2c = deepBackend.fromString('0.10000000000000000002');
//     const diff = near2c.sub(near1c);
//     console.log('near2 - near1 (fixed):', diff.toNumber()); // expect ~1e-20
//     console.log('near2 - near1 (float64):', 0.10000000000000000002 - 0.10000000000000000001); // expect 0
//   }

//   console.log("====")

//   {
//     const backend = decimalJsBackend(25);
//     const near1 = backend.fromString('0.10000000000000000001');
//     const near2 = backend.fromString('0.10000000000000000002');
//     const diff = near2.sub(near1);
//     console.log('decimal.js near2 - near1:', diff.toNumber()); // expect ~1e-20

//     // Same repeated-multiplication check as bigint-fixed, for a direct
//     // apples-to-apples comparison of the two backends' behavior.
//     let acc = backend.fromString('0.1');
//     const oneTenth = backend.fromString('0.1');
//     for (let i = 0; i < 19; i++) acc = acc.mul(oneTenth);
//     console.log('decimal.js 0.1^20:', acc.toNumber());
//   }

//   {
//     const backend = doubleDoubleBackend(30);
//     const near1 = backend.fromString('0.10000000000000000001');
//     const near2 = backend.fromString('0.10000000000000000002');
//     console.log('double-double near2 - near1:', near2.sub(near1).toNumber()); // expect ~1e-20

//     let acc = backend.fromString('0.1');
//     const oneTenth = backend.fromString('0.1');
//     for (let i = 0; i < 19; i++) acc = acc.mul(oneTenth);
//     console.log('double-double 0.1^20:', acc.toNumber()); // expect 1e-20
//   }


//  {
//     // Escape-bailout included (per the earlier fix) and a genuinely bounded
//     // test point (-0.5 + 0i sits deep in the main cardioid — orbit stays
//     // small and bounded for the full iteration count, never triggers the
//     // bailout). This is what makes the timings comparable across backends:
//     // every backend does the same fixed amount of real work.
//     function benchmarkBackend(
//       backend: ReturnType<typeof bigIntFixedBackend>,
//       iterations: number,
//     ): number {
//       const cRe = backend.fromString('-0.5');
//       const cIm = backend.fromString('0');
//       let zRe = backend.fromNumber(0);
//       let zIm = backend.fromNumber(0);
//       let completed = 0;

//       const start = performance.now();
//       for (let i = 0; i < iterations; i++) {
//         const zReSq = zRe.mul(zRe);
//         const zImSq = zIm.mul(zIm);
//         const magnitude = zReSq.add(zImSq).toNumber();
//         if (magnitude >= 4) break; // shouldn't fire for this c, kept for parity with real usage
//         const twoZReZIm = zRe.mul(zIm).add(zRe.mul(zIm));
//         const nextRe = zReSq.sub(zImSq).add(cRe);
//         const nextIm = twoZReZIm.add(cIm);
//         zRe = nextRe;
//         zIm = nextIm;
//         completed = i + 1;
//       }
//       // Force the result to stay live (see the dead-code-elimination caveat
//       // from Step 8) — logged at the very end, not read per-run.
//       lastResult = zRe.toNumber();
//       return performance.now() - start;
//     }

//     // Plain float64 baseline — identical iteration shape, no backend
//     // wrapper, nothing to inline/allocate away. This is the "digits <= ~16"
//     // column every other backend is being measured against.
//     function benchmarkFloat64(iterations: number): number {
//       const cRe = -0.5;
//       const cIm = 0;
//       let zRe = 0;
//       let zIm = 0;

//       const start = performance.now();
//       for (let i = 0; i < iterations; i++) {
//         const zReSq = zRe * zRe;
//         const zImSq = zIm * zIm;
//         const magnitude = zReSq + zImSq;
//         if (magnitude >= 4) break;
//         const nextRe = zReSq - zImSq + cRe;
//         const nextIm = 2 * zRe * zIm + cIm;
//         zRe = nextRe;
//         zIm = nextIm;
//       }
//       lastResult = zRe;
//       return performance.now() - start;
//     }

//     let lastResult = 0; // sink for benchmark results, see note above

//     function median(values: number[]): number {
//       const sorted = [...values].sort((a, b) => a - b);
//       return sorted[Math.floor(sorted.length / 2)];
//     }

//     function timeRuns(fn: () => number, runs: number): number {
//       const times: number[] = [];
//       for (let r = 0; r < runs; r++) times.push(fn());
//       return median(times);
//     }

//     const ITERATIONS = 1000;
//     const RUNS = 100  // higher than Step 8's 5 — the low-digit numbers we care
//                       // about most here are the ones most vulnerable to the
//                       // timer-floor noise flagged earlier; more samples helps.
//     // const DIGIT_COUNTS = [10, 15, 20, 25, 30, 50, 100, 300, 1000];
//     const DIGIT_COUNTS = [400];


//     // Warm-up: run every approach once before any timed sample, so no
//     // column's first-ever call unfairly eats a JIT-compilation cost that
//     // later columns don't pay (see the warm-up note from Step 8).
//     console.log("Warming up.")
//     benchmarkFloat64(ITERATIONS);
//     for (const d of [10, 30, 100]) {
//       benchmarkBackend(bigIntFixedBackend(d), ITERATIONS);
//       benchmarkBackend(decimalJsBackend(d), ITERATIONS);
//       benchmarkBackend(doubleDoubleBackend(d), ITERATIONS);
//     }
//     console.log("We are warm.")


//     console.log(`float64 baseline (${ITERATIONS} iterations, ${RUNS} runs) median ms:`, timeRuns(() => benchmarkFloat64(ITERATIONS), RUNS));

//     for (const digits of DIGIT_COUNTS) {
//       const bigIntMedian = timeRuns(() => benchmarkBackend(bigIntFixedBackend(digits), ITERATIONS), RUNS);
//       const decimalMedian = timeRuns(() => benchmarkBackend(decimalJsBackend(digits), ITERATIONS), RUNS);
//       // double-double can't represent more than DD_DIGIT_BUDGET (30) digits —
//       // still runs (silently capped, per the earlier warning), so timing it
//       // beyond 30 tells you nothing new about accuracy, but IS still a valid
//       // check of whether its fixed per-op cost stays flat regardless of the
//       // requested (but uncapped-internally) digit count.
//       const ddMedian = timeRuns(() => benchmarkBackend(doubleDoubleBackend(digits), ITERATIONS), RUNS);

//       console.log(
//         `digits=${digits} | bigint-fixed: ${bigIntMedian.toFixed(3)}ms | decimal.js: ${decimalMedian.toFixed(3)}ms | double-double: ${ddMedian.toFixed(3)}ms`
//       );
//     }

//     console.log('(sink, ignore):', lastResult);
// } 

  // --- END SCRATCH ---

  loadSavedLogs();
  mountSettings();
  syncCanvasSize();
  updateStats();
  updateRenderStatus(true);
  wireControls();
  canvas.style.cursor = 'grab';
  requestRender();
}

window.addEventListener('resize', () => {
  if (settingsEngine.getValue('fillViewport') as boolean) {
    syncCanvasSize();
    requestRender();
  }
});

init();
