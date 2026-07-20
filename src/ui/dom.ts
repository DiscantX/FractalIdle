export const canvas = document.querySelector<HTMLCanvasElement>('#fractalCanvas')!;
export const settingsContainer = document.querySelector<HTMLElement>('#settingsContainer')!;
export const logCountOutput = document.querySelector<HTMLElement>('#logCountOutput')!;
export const lastRenderOutput = document.querySelector<HTMLElement>('#lastRenderOutput')!;
export const zoomOutput = document.querySelector<HTMLElement>('#zoomOutput')!;
export const activeIterationsOutput = document.querySelector<HTMLElement>('#activeIterationsOutput')!;
export const stepOutput = document.querySelector<HTMLElement>('#stepOutput')!;
export const renderButton = document.querySelector<HTMLButtonElement>('#renderButton')!;
export const exportLogsButton = document.querySelector<HTMLButtonElement>('#exportLogsButton')!;
export const benchmarkButton = document.querySelector<HTMLButtonElement>('#benchmarkButton')!;
export const renderStatusDot = document.querySelector<HTMLElement>('#renderStatusDot')!;
export const renderStatusText = document.querySelector<HTMLElement>('#renderStatusText')!;
export const renderStatusTimer = document.querySelector<HTMLElement>('#renderStatusTimer')!;

// Coordinate navigator
export const navCard = document.querySelector<HTMLElement>('#coordNav')!;
export const navSentinel = document.querySelector<HTMLElement>('#navSentinel')!;
export const navReInput = document.querySelector<HTMLInputElement>('#navReInput')!;
export const navImInput = document.querySelector<HTMLInputElement>('#navImInput')!;
export const navZoomInput = document.querySelector<HTMLInputElement>('#navZoomInput')!;
export const navOriginButton = document.querySelector<HTMLButtonElement>('#navOriginButton')!;
export const navCopyButton = document.querySelector<HTMLButtonElement>('#navCopyButton')!;
export const navPasteButton = document.querySelector<HTMLButtonElement>('#navPasteButton')!;

// Collapsible Current / Destination blocks (nav-card redesign). Toggle buttons
// own aria-expanded; the blocks carry .is-collapsed for the CSS height transition.
export const navCurrentBlock = document.querySelector<HTMLElement>('#navCurrentBlock')!;
export const navCurrentToggle = document.querySelector<HTMLButtonElement>('#navCurrentToggle')!;
export const navCurrentSummary = document.querySelector<HTMLElement>('#navCurrentSummary')!;
export const navDestinationBlock = document.querySelector<HTMLElement>('#navDestinationBlock')!;
export const navDestinationToggle = document.querySelector<HTMLButtonElement>('#navDestinationToggle')!;
export const navDestinationSummary = document.querySelector<HTMLElement>('#navDestinationSummary')!;

// Destination (staged target) coordinate fields + actions.
export const destReInput = document.querySelector<HTMLInputElement>('#destReInput')!;
export const destImInput = document.querySelector<HTMLInputElement>('#destImInput')!;
export const destZoomInput = document.querySelector<HTMLInputElement>('#destZoomInput')!;
export const destJumpButton = document.querySelector<HTMLButtonElement>('#destJumpButton')!;
export const destFlyToButton = document.querySelector<HTMLButtonElement>('#destFlyToButton')!;

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Canvas 2D context is not available.');
}
export const drawingContext = ctx;