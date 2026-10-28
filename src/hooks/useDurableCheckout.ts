import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { BusinessLine } from '@/lib/businessLine';
import {
  acknowledgeCheckout, checkoutError, checkoutKey, draftKey, editorLockKey, isDefinitiveSaleRejection, isRetryableTransportFailure,
  migrateBarberRecovery, prepareCheckout, readCheckout, readDraft, updateCheckout, writeDraft,
  type CheckoutRecord, type CheckoutResult,
} from '@/lib/checkoutRecovery';

const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAYS = [1_000, 3_000, 8_000];
type CheckoutRpcClient = {
  rpc: (name: string, args: {p_request_id: string; p_payload: unknown}) => {
    abortSignal: (signal: AbortSignal) => PromiseLike<{data: CheckoutResult | null; error: unknown}>;
  };
};
const checkoutClient = supabase as unknown as CheckoutRpcClient;
interface Options<P, R, D> {
  businessLine: BusinessLine;
  userId?: string;
  draft: D;
  restore: (draft: D | null, record: CheckoutRecord<P, R, D> | null) => void;
  confirmed: (record: CheckoutRecord<P, R, D>, result: CheckoutResult) => void;
  rejected: (message: string) => void;
}

export function useDurableCheckout<P, R, D>(options: Options<P, R, D>) {
  const {businessLine, userId, draft} = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const [record, setRecord] = useState<CheckoutRecord<P, R, D> | null>(null);
  const [ready, setReady] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const owned = useRef(false);
  const ownedScope = useRef<string | null>(null);
  const scope = userId ? editorLockKey(businessLine, userId) : null;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const attempts = useRef(0);
  const activeUser = useRef(userId);
  activeUser.current = userId;

  useEffect(() => {
    const epoch = ++generation.current;
    const acquisition = new AbortController();
    let release: (() => void) | undefined;
    owned.current = false;
    ownedScope.current = null;
    inFlight.current = false;
    attempts.current = 0;
    setReady(false); setIssue(null); setRecord(null); setProcessing(false);
    if (!userId) return;
    if (!navigator.locks) {
      setIssue('Este navegador no permite proteger el ticket entre pestañas. Abre el POS en un navegador actualizado con HTTPS.');
      return;
    }
    // Hold one editor per user/module, including every storage mutation and send.
    void navigator.locks.request(editorLockKey(businessLine, userId), {signal: acquisition.signal}, async () => {
      if (generation.current !== epoch || activeUser.current !== userId) return;
      owned.current = true;
      ownedScope.current = editorLockKey(businessLine, userId);
      try {
        if (businessLine === 'barbershop') migrateBarberRecovery(userId);
        const saved = readCheckout<P, R, D>(businessLine, userId);
        const savedDraft = saved && saved.state !== 'rejected' ? saved.draft : readDraft<D>(businessLine, userId) ?? saved?.draft ?? null;
        callbacks.current.restore(savedDraft, saved);
        setRecord(saved);
        setReady(true);
        if (saved?.state === 'confirmed' && saved.result) callbacks.current.confirmed(saved, saved.result);
        if (saved?.state === 'rejected' && saved.error) callbacks.current.rejected(saved.error);
      } catch (error) {
        setIssue(checkoutError(error));
      }
      await new Promise<void>(resolve => {
        release = resolve;
        if (acquisition.signal.aborted) resolve();
      });
    }).catch(error => {
      if (!acquisition.signal.aborted && generation.current === epoch) setIssue(checkoutError(error));
    });
    return () => {
      generation.current++;
      owned.current = false;
      ownedScope.current = null;
      acquisition.abort();
      controller.current?.abort();
      release?.();
    };
  }, [businessLine, userId]);

  // Save changes before the browser paints; pending requests always retain their own snapshot.
  const persistDraft = useCallback(() => {
    if (!owned.current || ownedScope.current !== scope || !ready || issue || !userId || activeUser.current !== userId) return;
    try {
      const saved = readCheckout(businessLine, userId);
      if (!saved || saved.state === 'rejected') writeDraft(businessLine, userId, callbacks.current.draft);
    } catch (error) { setIssue(checkoutError(error)); }
  }, [businessLine, userId, ready, issue, scope]);
  useLayoutEffect(persistDraft, [draft, persistDraft]);
  useEffect(() => {
    window.addEventListener('pagehide', persistDraft);
    return () => window.removeEventListener('pagehide', persistDraft);
  }, [persistDraft]);

  const run = useCallback(async (request: CheckoutRecord<P, R, D>) => {
    if (!owned.current || ownedScope.current !== editorLockKey(businessLine, request.userId) || inFlight.current || request.userId !== activeUser.current || issue) return;
    if (!navigator.onLine) { setOnline(false); return; }
    const epoch = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    inFlight.current = true;
    attempts.current++;
    setProcessing(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const response = await Promise.race([
        checkoutClient.rpc(businessLine === 'car_wash' ? 'complete_car_wash_sale' : 'complete_barbershop_sale', {
          p_request_id: request.id, p_payload: request.payload,
        }).abortSignal(abort.signal),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error('La solicitud se interrumpió. El cobro sigue guardado para verificarlo.'));
          abort.signal.addEventListener('abort', onAbort, {once: true});
          timer = setTimeout(() => {
            reject(new Error('La respuesta tardó demasiado. El cobro sigue guardado y se verificará con la misma clave.'));
            abort.abort();
          }, REQUEST_TIMEOUT_MS);
        }),
      ]);
      if (generation.current !== epoch || request.userId !== activeUser.current) return;
      const {data, error} = response;
      if (error) throw error;
      if (data?.success !== true || !data.ticket?.id || data.ticket.business_line !== businessLine) {
        throw new Error('No llegó una confirmación válida de este módulo. El ticket sigue pendiente.');
      }
      const confirmed = updateCheckout(request, {state: 'confirmed', result: data, error: undefined});
      setRecord(confirmed);
      // Cache refresh/printing must not change a committed sale back into a failed payment.
      try { callbacks.current.confirmed(confirmed, data); }
      catch { setIssue('La venta está confirmada y guardada. Vuelve a abrir el POS para recuperar el recibo; no registres otro cobro.'); }
    } catch (error) {
      if (generation.current !== epoch || request.userId !== activeUser.current) return;
      const message = checkoutError(error);
      try {
        const updated = updateCheckout(request, {state: isDefinitiveSaleRejection(error) ? 'rejected' : 'pending', error: message, retryable: isRetryableTransportFailure(error)});
        setRecord(updated);
        if (updated.state === 'rejected') callbacks.current.rejected(message);
      } catch (storageError) { setIssue(checkoutError(storageError)); }
    } finally {
      clearTimeout(timer);
      if (onAbort) abort.signal.removeEventListener('abort', onAbort);
      if (generation.current === epoch) {
        inFlight.current = false;
        controller.current = null;
        setProcessing(false);
      }
    }
  }, [businessLine, issue]);

  const start = useCallback(async (payload: P, receipt: R) => {
    if (!ready || !owned.current || ownedScope.current !== scope || inFlight.current || !userId || issue) return;
    try {
      const existing = readCheckout<P, R, D>(businessLine, userId);
      if (existing && existing.state !== 'rejected') { setRecord(existing); return; }
      const saved = prepareCheckout(businessLine, userId, payload, receipt, callbacks.current.draft);
      setRecord(saved);
      attempts.current = 0;
      await run(saved);
    } catch (error) { setIssue(checkoutError(error)); }
  }, [businessLine, userId, ready, issue, run, scope]);

  const retry = useCallback(async () => {
    if (!userId || !owned.current || ownedScope.current !== scope || inFlight.current || issue) return;
    try {
      const saved = readCheckout<P, R, D>(businessLine, userId);
      if (saved?.state === 'pending') { attempts.current = 0; await run(saved); }
    } catch (error) { setIssue(checkoutError(error)); }
  }, [businessLine, userId, issue, run, scope]);

  useEffect(() => {
    const onOnline = () => { attempts.current = 0; setOnline(true); };
    const onOffline = () => { setOnline(false); controller.current?.abort(); };
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => {
    if (!ready || !online || processing || issue || record?.state !== 'pending' || record.retryable === false || attempts.current > RETRY_DELAYS.length) return;
    const delay = RETRY_DELAYS[Math.max(0, attempts.current - 1)];
    const timer = setTimeout(() => { void run(record); }, delay);
    return () => clearTimeout(timer);
  }, [ready, online, processing, issue, record, run]);

  const acknowledge = useCallback(() => {
    if (!owned.current || ownedScope.current !== scope || inFlight.current || !userId) return false;
    try {
      acknowledgeCheckout(businessLine, userId);
      setRecord(null);
      attempts.current = 0;
      return true;
    } catch (error) { setIssue(checkoutError(error)); return false; }
  }, [businessLine, userId, scope]);

  const backup = useCallback(() => {
    const accessible = !!userId && owned.current && ownedScope.current === scope;
    let raw: {draft: string | null; checkout: string | null; legacy: string | null} | null = null;
    if (accessible) {
      try { raw = {draft: localStorage.getItem(draftKey(businessLine, userId)), checkout: localStorage.getItem(checkoutKey(businessLine, userId)),
        legacy: businessLine === 'barbershop' ? sessionStorage.getItem(`pos:barbershop:pending-sale:v1:${userId}`) : null}; }
      catch { /* The in-memory copy can still be downloaded if storage is blocked. */ }
    }
    return JSON.stringify({
      version: 1, exportedAt: new Date().toISOString(), businessLine, userId,
      draft: accessible ? callbacks.current.draft : null, checkout: accessible ? record : null, raw,
    }, null, 2);
  }, [businessLine, userId, record, scope]);
  const ownsThisScope = !!scope && ownedScope.current === scope;

  return {
    ready: ready && ownsThisScope, issue, record: ownsThisScope ? record : null, processing, online, start, retry, acknowledge, backup,
    blocked: !ready || !ownsThisScope || !!issue || processing || record?.state === 'pending' || record?.state === 'confirmed',
  };
}
