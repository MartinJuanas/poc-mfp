import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
/** One request per resource; abort on filter change or unmount. */
export default function useResource(endpoint, revision = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // A resource change deliberately clears stale data before fetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ data: null, loading: Boolean(endpoint), error: '' });
    if (!endpoint) return () => controller.abort();
    api.request(endpoint, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setState({ data: result.data, loading: false, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ data: null, loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [endpoint, revision, retry]);
  const reload = useCallback(() => setRetry(v => v + 1), []);
  return { ...state, reload };
}
