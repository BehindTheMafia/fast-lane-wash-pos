import type { BusinessLine } from './businessLine';

export interface CheckoutRecord<P = unknown, R = unknown, D = unknown> {
  version: 2;
  id: string;
  userId: string;
  businessLine: BusinessLine;
  state: 'pending' | 'rejected' | 'confirmed';
  payload: P;
  receipt: R;
  draft: D | null;
  result?: CheckoutResult;
  error?: string;
  retryable?: boolean;
}
export interface CheckoutResult {
  success: true;
  ticket: { id: number | string; [key: string]: unknown };
  rewards_earned?: { reward_name: string; [key: string]: unknown }[];
}
export const checkoutKey = (line: BusinessLine, userId: string) => `pos:recovery:v2:${line}:${userId}`;
export const draftKey = (line: BusinessLine, userId: string) => `pos:draft:v2:${line}:${userId}`;
export const editorLockKey = (line: BusinessLine, userId: string) => `pos:editor:v2:${line}:${userId}`;
const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** All mutations run while the user/module editor Web Lock is held. */
export function readCheckout<P, R, D>(line: BusinessLine, userId: string, storage: Storage = localStorage): CheckoutRecord<P, R, D> | null {
  const raw = storage.getItem(checkoutKey(line, userId));
  if (raw === null) return null;
  const record = JSON.parse(raw) as CheckoutRecord<P, R, D>;
  const content = record as unknown as {payload?: {items?: unknown; payment?: unknown}; receipt?: {items?: unknown}};
  if (record?.version !== 2 || record.userId !== userId || record.businessLine !== line || !uuid.test(record.id) ||
    !['pending', 'rejected', 'confirmed'].includes(record.state) || !record.payload || !record.receipt ||
    !Array.isArray(content.payload?.items) || !content.payload?.payment || typeof content.payload.payment !== 'object' || !Array.isArray(content.receipt?.items) ||
    (record.state === 'confirmed' && (record.result?.success !== true || !record.result.ticket?.id || record.result.ticket.business_line !== line))) {
    throw new Error('El registro local del cobro no se puede leer. Revisa Reportes antes de volver a cobrar.');
  }
  return record;
}

export function prepareCheckout<P, R, D>(line: BusinessLine, userId: string, payload: P, receipt: R, draft: D, storage: Storage = localStorage): CheckoutRecord<P, R, D> {
  const previous = readCheckout<P, R, D>(line, userId, storage);
  if (previous && previous.state !== 'rejected') throw new Error('Ya existe un cobro por verificar o un recibo por cerrar.');
  const record: CheckoutRecord<P, R, D> = copy({version: 2, id: previous?.id ?? crypto.randomUUID(), userId, businessLine: line, state: 'pending', payload, receipt, draft});
  storage.setItem(checkoutKey(line, userId), JSON.stringify(record));
  return record;
}

export function updateCheckout<P, R, D>(request: CheckoutRecord<P, R, D>, changes: Pick<CheckoutRecord<P, R, D>, 'state'> & Partial<Pick<CheckoutRecord<P, R, D>, 'result' | 'error' | 'retryable'>>, storage: Storage = localStorage): CheckoutRecord<P, R, D> {
  const current = readCheckout<P, R, D>(request.businessLine, request.userId, storage);
  if (!current || current.id !== request.id || JSON.stringify(current.payload) !== JSON.stringify(request.payload)) {
    throw new Error('El cobro local cambió. Recupera el ticket antes de continuar.');
  }
  // A late error cannot undo a durable acknowledgement.
  if (current.state === 'confirmed') return current;
  const updated = copy({...current, ...changes});
  storage.setItem(checkoutKey(request.businessLine, request.userId), JSON.stringify(updated));
  return updated;
}

export function acknowledgeCheckout(line: BusinessLine, userId: string, storage: Storage = localStorage): void {
  const current = readCheckout(line, userId, storage);
  if (current && current.state !== 'confirmed') throw new Error('No se puede descartar un cobro sin confirmar.');
  // Clear the draft first: if removal fails, the confirmed receipt remains recoverable.
  storage.removeItem(draftKey(line, userId));
  storage.removeItem(checkoutKey(line, userId));
}

export function readDraft<D>(line: BusinessLine, userId: string, storage: Storage = localStorage): D | null {
  const raw = storage.getItem(draftKey(line, userId));
  if (raw === null) return null;
  const saved = JSON.parse(raw);
  if (saved?.version !== 2 || saved.userId !== userId || saved.businessLine !== line || !saved.draft || typeof saved.draft !== 'object') {
    throw new Error('El borrador guardado no se puede recuperar. Revisa el dispositivo antes de continuar.');
  }
  return saved.draft as D;
}
export function writeDraft<D>(line: BusinessLine, userId: string, draft: D, storage: Storage = localStorage): void {
  storage.setItem(draftKey(line, userId), JSON.stringify({version: 2, userId, businessLine: line, draft}));
}

/** Migrate the earlier tab-only barber recovery without deleting its sole copy. */
export function migrateBarberRecovery(userId: string, storage: Storage = localStorage, legacy: Storage = sessionStorage): void {
  const key = `pos:barbershop:pending-sale:v1:${userId}`;
  const raw = legacy.getItem(key);
  if (raw === null) return;
  const old = JSON.parse(raw);
  if (old?.version !== 1 || old.userId !== userId || !uuid.test(old.id) || !Array.isArray(old.payload?.items) || !old.payload.payment ||
    !Array.isArray(old.receipt?.items) || !['pending', 'rejected'].includes(old.state)) {
    throw new Error('No se pudo migrar el cobro pendiente anterior. Revisa Reportes.');
  }
  const existing = readCheckout('barbershop', userId, storage);
  if (existing && (existing.id !== old.id || JSON.stringify(existing.payload) !== JSON.stringify(old.payload))) {
    throw new Error('Hay dos cobros locales diferentes por revisar. No se descartó ninguno.');
  }
  if (!existing) storage.setItem(checkoutKey('barbershop', userId), JSON.stringify({...old, version: 2, businessLine: 'barbershop', draft: null}));
  legacy.removeItem(key);
}

export function isDefinitiveSaleRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const {code, details, message} = error as {code?: unknown; details?: unknown; message?: unknown};
  // The legacy car-wash RPC did not attach a conflict detail until the latest migration.
  if (details === 'IDEMPOTENCY_CONFLICT' || (typeof message === 'string' && /solicitud.*(otros datos|datos diferentes)/i.test(message)) || typeof code !== 'string') return false;
  return code === 'P0001' || code === '42501' || /^(22|23)[\dA-Z]{3}$/.test(code) ||
    (code.startsWith('40') && code !== '40003' && /^[\dA-Z]{5}$/.test(code));
}
export function checkoutError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'No se pudo confirmar el cobro. El ticket sigue guardado en este dispositivo.';
}

export function isRetryableTransportFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const code = 'code' in error ? error.code : undefined;
  return !code || code === 'PGRST000' || (typeof code === 'string' && /^(08|53|57)/.test(code));
}
