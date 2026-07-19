// Tiny inline sparkline — a self-contained, reusable renderer with no knowledge
// of any particular caller (no imports from the perf overlay, state, or
// settings). It owns an SVG <polyline> and its own ring buffer of samples, so it
// can be dropped into any DOM context or later back a larger graph.
//
// Coloring:
//  - By default the whole line uses one stroke color (set via setColor).
//  - If a `colorize(value)` callback is supplied (via options or setColorize),
//    each *vertex* is colored by its own value and the stroke becomes an SVG
//    linear gradient whose stops interpolate between neighboring node colors —
//    so a low point reads red and a high point green, exactly as a caller's
//    value gradient would. The callback stays in the caller (keeping this module
//    decoupled); it returns null to fall back to the flat stroke color.
//
// Usage:
//   const s = new Sparkline({ colorize: (v) => myGradient(v) });
//   parent.appendChild(s.element);   // insert once
//   s.setColor(fallback);            // optional flat fallback for null nodes
//   s.push(value);                   // call per sample; redraws automatically

const SVG_NS = 'http://www.w3.org/2000/svg';

// Keep in sync with `--spark-w` in style.css: the SVG's drawn width and the
// overlay's left gutter must match so every sparkline aligns to the same column.
const DEFAULT_WIDTH = 64;

export interface SparklineOptions {
  maxPoints?: number; // ring-buffer capacity (default 60)
  width?: number; // svg width in px (default 64)
  height?: number; // svg height in px (default 14)
  color?: string; // flat stroke color (default muted gray)
  min?: number; // fixed lower bound; default = auto (data min)
  max?: number; // fixed upper bound; default = auto (data max)
  // Per-vertex color; null → use the flat `color`. When set, the stroke is a
  // gradient interpolated between node colors rather than a single color.
  colorize?: (value: number) => string | null;
}

let gradSeq = 0;

export class Sparkline {
  readonly element: SVGSVGElement;
  private readonly polyline: SVGPolylineElement;
  private readonly gradient: SVGGradientElement;
  private readonly gradId: string;
  private readonly data: number[] = [];
  private readonly maxPoints: number;
  private readonly width: number;
  private readonly height: number;
  private readonly fixedMin: number | undefined;
  private readonly fixedMax: number | undefined;
  private color: string;
  private colorize: ((value: number) => string | null) | null;

  constructor(opts: SparklineOptions = {}) {
    this.maxPoints = opts.maxPoints ?? 60;
    this.width = opts.width ?? DEFAULT_WIDTH;
    this.height = opts.height ?? 14;
    this.color = opts.color ?? '#8b949e';
    this.colorize = opts.colorize ?? null;
    this.fixedMin = opts.min;
    this.fixedMax = opts.max;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'perf-spark');
    svg.setAttribute('width', String(this.width));
    svg.setAttribute('height', String(this.height));
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    this.element = svg;

    // Gradient defs: userSpaceOnUse + x2=width so stop offsets (x/width) align
    // exactly with each vertex's x coordinate, even before the buffer is full.
    const defs = document.createElementNS(SVG_NS, 'defs');
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    this.gradId = `spark-grad-${++gradSeq}`;
    grad.setAttribute('id', this.gradId);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', String(this.width));
    grad.setAttribute('y2', '0');
    defs.appendChild(grad);
    this.gradient = grad;
    svg.appendChild(defs);

    const poly = document.createElementNS(SVG_NS, 'polyline');
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', this.color);
    poly.setAttribute('stroke-width', '1.5');
    poly.setAttribute('stroke-linejoin', 'round');
    poly.setAttribute('stroke-linecap', 'round');
    // Keep the stroke crisp at any CSS size; the viewBox handles scaling.
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    poly.setAttribute('points', '');
    this.polyline = poly;
    svg.appendChild(poly);
  }

  // Append a sample, evict the oldest past capacity, and redraw.
  push(value: number): void {
    this.data.push(value);
    if (this.data.length > this.maxPoints) {
      this.data.shift();
    }
    this.render();
  }

  // Recolor the flat stroke (used as the fallback for null nodes when colorize
  // is active, and as the sole stroke when it is not).
  setColor(color: string): void {
    this.color = color;
    if (!this.colorize) {
      this.polyline.setAttribute('stroke', color);
    }
  }

  // Set (or clear with null) the per-vertex coloring callback. Takes effect on
  // the next push; call before push for the very first render to avoid a one-
  // window flat-color flash.
  setColorize(fn: ((value: number) => string | null) | null): void {
    this.colorize = fn;
  }

  // Empty the buffer and clear the drawing.
  clear(): void {
    this.data.length = 0;
    this.polyline.setAttribute('points', '');
    this.clearGradient();
  }

  private clearGradient(): void {
    while (this.gradient.firstChild) {
      this.gradient.removeChild(this.gradient.firstChild);
    }
  }

  private render(): void {
    const n = this.data.length;
    // Need at least two points to draw a line; before that, show nothing.
    if (n < 2) {
      this.polyline.setAttribute('points', '');
      this.clearGradient();
      this.polyline.setAttribute('stroke', this.color);
      return;
    }

    const min = this.fixedMin ?? Math.min(...this.data);
    const max = this.fixedMax ?? Math.max(...this.data);
    const range = max - min || 1; // flat series → mid-height line
    const denom = this.maxPoints - 1;

    let pts = '';
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      // Anchor the newest sample at the right edge so the line scrolls left as
      // history fills, then spans the full width once the buffer is at capacity.
      const x = this.width * (1 - (n - 1 - i) / denom);
      xs.push(x);
      const y = this.height - ((this.data[i] - min) / range) * this.height;
      pts += `${x.toFixed(1)},${y.toFixed(1)} `;
    }
    this.polyline.setAttribute('points', pts.trimEnd());

    if (this.colorize) {
      this.clearGradient();
      for (let i = 0; i < n; i++) {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', (xs[i] / this.width).toFixed(4));
        stop.setAttribute('stop-color', this.colorize(this.data[i]) ?? this.color);
        this.gradient.appendChild(stop);
      }
      this.polyline.setAttribute('stroke', `url(#${this.gradId})`);
    } else {
      this.polyline.setAttribute('stroke', this.color);
    }
  }
}
