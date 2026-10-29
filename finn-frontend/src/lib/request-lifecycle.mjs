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
