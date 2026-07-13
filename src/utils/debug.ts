import { ViewState, DebugEvent } from '../types';
import { state, renderContext } from '../state';

export function formatViewForDebug(view: ViewState) {
  return {
    centerRe: Number(view.centerRe.toPrecision(8)),
    centerIm: Number(view.centerIm.toPrecision(8)),
    zoom: Number(view.zoom.toPrecision(8)),
  };
}

export function markDebug(
  label: string,
  details?: Record<string, number | string | boolean | null>,
  renderId = state.activeRenderId
) {
  if (!window.mandelbrotDebug?.enabled) {
    return;
  }

  const event: DebugEvent = {
    index: renderContext.debugEvents.length,
    time: Number(performance.now().toFixed(2)),
    label,
    renderId,
    activeRenderId: state.activeRenderId,
    zoomGeneration: renderContext.zoomAnimationGeneration,
    view: formatViewForDebug(state.view),
    details,
  };
  renderContext.debugEvents.push(event);
  console.debug('[mandelbrot]', event);
}

export function installDebugTools() {
  window.mandelbrotDebug = {
    enabled: false,
    events: renderContext.debugEvents,
    clear: () => {
      renderContext.debugEvents.length = 0;
    },
    dump: () =>
      renderContext.debugEvents.map((event) => ({
        ...event,
        view: { ...event.view },
        details: event.details ? { ...event.details } : undefined,
      })),
    table: () => {
      console.table(
        renderContext.debugEvents.map((event) => ({
          index: event.index,
          time: event.time,
          label: event.label,
          renderId: event.renderId,
          activeRenderId: event.activeRenderId,
          zoomGeneration: event.zoomGeneration,
          zoom: event.view.zoom,
          centerRe: event.view.centerRe,
          centerIm: event.view.centerIm,
          details: event.details ? JSON.stringify(event.details) : '',
        }))
      );
    },
  };
}
