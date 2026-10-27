import { useEffect, useRef } from 'react';

/** Local mutations refresh immediately; other terminals refresh on focus/minute. */
export function useTicketRefresh(refresh: () => unknown) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    const run = () => { if (document.visibilityState === 'visible') void latest.current(); };
    window.addEventListener('report-tickets-changed', run);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    const timer = window.setInterval(run, 60_000);
    return () => {
      window.removeEventListener('report-tickets-changed', run);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
      window.clearInterval(timer);
    };
  }, []);
}
