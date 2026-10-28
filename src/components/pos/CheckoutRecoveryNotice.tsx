interface Props {
  ready: boolean;
  issue: string | null;
  processing: boolean;
  online: boolean;
  record: {state: string; error?: string; retryable?: boolean} | null;
  retry: () => Promise<void>;
  backup: () => string;
}
export default function CheckoutRecoveryNotice({ready, issue, processing, online, record, retry, backup}: Props) {
  const downloadBackup = () => {
    const url = URL.createObjectURL(new Blob([backup()], {type: 'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `respaldo-pos-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  if (ready && !issue && record?.state !== 'pending') return !online ? (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-amber-100 text-amber-900 px-4 py-2 shadow">
      Sin conexión. El ticket se conserva en este dispositivo.
    </div>
  ) : null;
  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-lg space-y-4" role="alert">
        <h2 className="text-xl font-bold">{issue ? 'Revisar recuperación del ticket' : !ready ? 'Recuperando ticket' : 'Verificar cobro pendiente'}</h2>
        <p>{issue || (!ready ? 'Esperando acceso al ticket. Si está abierto en otra pestaña, ciérrala para continuar aquí.' :
          processing ? 'Verificando el cobro guardado. No vuelvas a registrar esta venta.' :
          record?.retryable === false ? 'El cobro necesita revisión. Conservamos los datos originales; revisa el mensaje y verifica el ticket antes de volver a cobrar.' :
          !online ? 'Venta guardada en este dispositivo. Se verificará al recuperar la conexión; aún no está confirmada.' :
          'El cobro sigue guardado. La verificación usará la misma clave para evitar duplicados.')}</p>
        {record?.error && !issue && <p className="text-sm text-muted-foreground">{record.error}</p>}
        {ready && !issue && record?.state === 'pending' && (
          <button type="button" className="btn-cobrar w-full disabled:opacity-50" disabled={processing || !online} onClick={() => { void retry(); }}>
            {processing ? 'Verificando…' : 'Verificar venta pendiente'}
          </button>
        )}
        {(issue || record?.state === 'pending') && <button type="button" className="touch-btn w-full border rounded-lg p-3" onClick={downloadBackup}>Descargar respaldo del ticket</button>}
        <a href="/reports" className="block text-center text-secondary underline">Revisar tickets en Reportes</a>
      </div>
    </div>
  );
}
