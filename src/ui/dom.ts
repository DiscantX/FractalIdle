export const canvas = document.querySelector<HTMLCanvasElement>('#fractalCanvas')!;
export const settingsContainer = document.querySelector<HTMLElement>('#settingsContainer')!;
export const logCountOutput = document.querySelector<HTMLElement>('#logCountOutput')!;
export const lastRenderOutput = document.querySelector<HTMLElement>('#lastRenderOutput')!;
export const zoomOutput = document.querySelector<HTMLElement>('#zoomOutput')!;
export const activeIterationsOutput = document.querySelector<HTMLElement>('#activeIterationsOutput')!;
export const stepOutput = document.querySelector<HTMLElement>('#stepOutput')!;
export const renderButton = document.querySelector<HTMLButtonElement>('#renderButton')!;
export const resetButton = document.querySelector<HTMLButtonElement>('#resetButton')!;
export const exportLogsButton = document.querySelector<HTMLButtonElement>('#exportLogsButton')!;
export const benchmarkButton = document.querySelector<HTMLButtonElement>('#benchmarkButton')!;
export const renderStatusDot = document.querySelector<HTMLElement>('#renderStatusDot')!;
export const renderStatusText = document.querySelector<HTMLElement>('#renderStatusText')!;
export const renderStatusTimer = document.querySelector<HTMLElement>('#renderStatusTimer')!;

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Canvas 2D context is not available.');
}
export const drawingContext = ctx;