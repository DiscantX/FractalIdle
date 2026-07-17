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
export const navJumpButton = document.querySelector<HTMLButtonElement>('#navJumpButton')!;
export const navOriginButton = document.querySelector<HTMLButtonElement>('#navOriginButton')!;
export const navCopyButton = document.querySelector<HTMLButtonElement>('#navCopyButton')!;
export const navPasteButton = document.querySelector<HTMLButtonElement>('#navPasteButton')!;

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Canvas 2D context is not available.');
}
export const drawingContext = ctx;