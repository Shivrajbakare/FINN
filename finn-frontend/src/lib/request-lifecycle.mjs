// Cleanup suppresses both late successes and late failures, even if a transport
// ignores abort. Used for settings changes and navigation away from a scan.
export function startRequest(load, receive) {
  const controller = new AbortController();
  load(controller.signal).then(
    (data) => {
      if (!controller.signal.aborted) receive({ data, error: null });
    },
    (error) => {
      if (!controller.signal.aborted) receive({ data: null, error: error.message });
    },
  );
  return () => controller.abort();
}

export function startPolling(load, receive, interval = 300000, timers = globalThis) {
  const controller = new AbortController();
  let timer;
  async function poll() {
    try {
      const data = await load(controller.signal);
      if (!controller.signal.aborted) receive({ data, error: null });
    } catch (error) {
      if (!controller.signal.aborted) receive({ data: null, error: error.message });
    } finally {
      if (!controller.signal.aborted) timer = timers.setTimeout(poll, interval);
    }
  }
  poll();
  return () => { controller.abort(); timers.clearTimeout(timer); };
}
