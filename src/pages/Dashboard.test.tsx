import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

const state = vi.hoisted(() => ({ line:'barbershop', from:vi.fn(), settings:{ exchange_rate:36.5 }, queryClient:{} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase:{ from:state.from } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient:() => state.queryClient }));
vi.mock('@/hooks/useTicketRefresh', () => ({ useTicketRefresh:vi.fn() }));
vi.mock('@/hooks/useBusinessSettings', () => ({ useBusinessSettings:() => ({data:state.settings}) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth:() => ({profile:{},isAdmin:true,isOwner:false,isCajero:false}) }));
vi.mock('@/contexts/BusinessLineContext', () => ({ useBusinessLine:() => ({businessLine:state.line,isBarbershop:state.line==='barbershop'}) }));
vi.mock('@/hooks/useProducts', () => ({ useLowStockProducts:() => ({data:[]}) }));
vi.mock('@/hooks/useCarWashInventory', () => ({ useLowStockCarWashProducts:() => ({outOfStock:[],lowStock:[]}), computeAvailableServices:vi.fn() }));
vi.mock('@/components/pos/TicketPrint', () => ({ default:() => null }));
vi.mock('@/components/PermissionModal', () => ({ default:() => null }));

const ticket = (number:string, method?:string) => ({id:1,ticket_number:number,total:150,created_at:'2026-10-27T18:00:00Z',payments:method?[{payment_method:method,amount:150,currency:'NIO'}]:[],ticket_items:[],ticket_mixed_payments:[]});
function query(result:unknown) {
  const builder:{[key:string]:unknown} = {};
  for(const name of ['select','eq','gte','order']) builder[name]=vi.fn(() => builder);
  builder.range=vi.fn(() => result);
  return builder;
}
beforeEach(() => { state.line='barbershop'; state.from.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('dashboard payment loading', () => {
  it('loads ticket and payment details together and names unavailable payments explicitly', async () => {
    const builder=query(Promise.resolve({data:[ticket('B-ONE','card'),{...ticket('B-OLD'),id:2}],error:null}));
    state.from.mockReturnValue(builder);
    render(<Dashboard />);
    expect(await screen.findByText('B-ONE')).toBeInTheDocument();
    expect(screen.getByText('Pago no disponible')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Hay tickets sin pago disponible');
    expect(state.from).toHaveBeenCalledTimes(1);
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('payments(*)'));
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('ticket_mixed_payments(*)'));
  });

  it('shows a retryable error instead of an empty or partial table on query failure', async () => {
    vi.spyOn(console,'error').mockImplementation(() => {});
    state.from.mockReturnValueOnce(query(Promise.resolve({data:null,error:{message:'Network error'}})))
      .mockReturnValueOnce(query(Promise.resolve({data:[ticket('B-RETRY','cash')],error:null})));
    render(<Dashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el panel completo');
    expect(screen.queryByText('No hay tickets hoy')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));
    expect(await screen.findByText('B-RETRY')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores an old request when switching business areas during loading', async () => {
    let resolveOld!: (value:unknown) => void;
    const old = new Promise(resolve => { resolveOld=resolve; });
    state.from.mockReturnValueOnce(query(old))
      .mockReturnValueOnce(query(Promise.resolve({data:[ticket('T-NEW','transfer')],error:null})));
    const view=render(<Dashboard />);
    state.line='car_wash';
    view.rerender(<Dashboard />);
    expect(await screen.findByText('T-NEW')).toBeInTheDocument();
    await act(async () => { resolveOld({data:[ticket('B-STALE')],error:null}); });
    await waitFor(() => expect(screen.queryByText('B-STALE')).not.toBeInTheDocument());
    expect(screen.getByText('T-NEW')).toBeInTheDocument();
  });
});
