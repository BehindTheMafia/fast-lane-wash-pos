import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BarbershopPOS from './BarbershopPOS';
import { prepareCheckout, readCheckout } from '@/lib/checkoutRecovery';
const readPendingBarberSale=(userId:string)=>readCheckout('barbershop',userId);

const state=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),user:{id:'cashier-1'},settings:{exchange_rate:36.5},printed:vi.fn(),invalidate:vi.fn(),queryClient:{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args: unknown[])=>({abortSignal:()=>state.rpc(...args)}),from:state.from}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>state.queryClient}));
vi.mock('@/lib/ticketMutation',()=>({invalidateTicketData:state.invalidate}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:state.user})}));
vi.mock('@/hooks/useServices',()=>({useBarberServices:()=>({data:[{id:1,name:'Corte',base_price:150}]}),useCarWashServicesForMix:()=>({data:[]})}));
vi.mock('@/hooks/useProducts',()=>({useProducts:()=>({data:[]})}));
vi.mock('@/hooks/useVehicleTypes',()=>({useVehicleTypes:()=>({data:[]})}));
vi.mock('@/hooks/useBusinessSettings',()=>({useBusinessSettings:()=>({data:state.settings})}));
vi.mock('@/contexts/BusinessLineContext',()=>({useBusinessLine:()=>({carWashVisible:false})}));
vi.mock('./CustomerModal',()=>({default:()=>null}));
vi.mock('./TicketPrint',()=>({default:({ticket}:{ticket:unknown})=>{state.printed(ticket);return <p>Recibo confirmado</p>;}}));

const payment={method:'cash',currency:'NIO',amount:150,received:200,change:50};
const payload={customer_id:1,exchange_rate:36.5,items:[{item_type:'service',service_id:1,product_id:null,name:'Corte',quantity:1,line_total:150}],payment};
const customer={id:1,name:'Cliente general',plate:'',phone:'',is_general:true};
const receipt={customer,items:[{itemType:'service' as const,serviceId:1,name:'Corte',price:150,quantity:1,discountPercent:0}],subtotal:150,discount:0};
const success={data:{success:true,ticket:{id:10,business_line:'barbershop',ticket_number:'B-CONFIRMED',total:150,status:'paid'}},error:null};

beforeEach(()=>{
  state.user.id='cashier-1';state.invalidate.mockReset();state.invalidate.mockResolvedValue(undefined);
  sessionStorage.clear();state.rpc.mockReset();state.from.mockReset();state.printed.mockClear();state.settings.exchange_rate=36.5;
  state.from.mockImplementation(()=>{
    const query:{[key:string]:unknown}={};
    for(const name of ['select','eq','gte','order']) query[name]=vi.fn(()=>query);
    query.maybeSingle=()=>Promise.resolve({data:customer,error:null});
    query.limit=()=>Promise.resolve({data:[],error:null});
    return query;
  });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function openCheckout(){
  await screen.findByText('Cliente general');
  fireEvent.click(screen.getByRole('button',{name:/Corte C\$150/}));
  fireEvent.click(screen.getByRole('button',{name:'COBRAR'}));
  fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:'200'}});
}

describe('barber sale idempotency in the checkout',()=>{
  it('persists before sending and recovers the original request after a lost response and remount',async()=>{
    let finish!: (value:unknown)=>void;
    state.rpc.mockImplementationOnce((_name,args)=>{
      expect(readPendingBarberSale(state.user.id)?.id).toBe(args.p_request_id);
      return new Promise(resolve=>{finish=resolve;});
    });
    const firstView=render(<BarbershopPOS/>);
    await openCheckout();
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    expect(state.rpc).toHaveBeenCalledTimes(1);
    const original=state.rpc.mock.calls[0][1];
    await act(async()=>{finish({data:null,error:{message:'Failed to fetch'}});});
    expect(await screen.findByRole('button',{name:'Verificar venta pendiente'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'COBRAR'})).toBeDisabled();
    firstView.unmount();
    // Catalog/settings can change while the terminal is disconnected.
    state.settings.exchange_rate=40;
    state.rpc.mockResolvedValueOnce(success);
    render(<BarbershopPOS/>);
    fireEvent.click(await screen.findByRole('button',{name:'Verificar venta pendiente'}));
    expect(await screen.findByText('Recibo confirmado')).toBeInTheDocument();
    expect(state.rpc.mock.calls[1][1]).toEqual(original);
    expect(state.printed).toHaveBeenLastCalledWith(expect.objectContaining({payment,settings:expect.objectContaining({exchange_rate:36.5})}));
    expect(readPendingBarberSale(state.user.id)?.state).toBe('confirmed');
  });

  it('allows a corrected attempt after a proven database rollback',async()=>{
    state.rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',message:'Stock insuficiente'}}).mockResolvedValueOnce(success);
    render(<BarbershopPOS/>);
    await openCheckout();
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    await waitFor(()=>expect(readPendingBarberSale(state.user.id)?.state).toBe('rejected'));
    expect(screen.queryByRole('button',{name:'Verificar venta pendiente'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'COBRAR'}));
    fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:'200'}});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    expect(await screen.findByText('Recibo confirmado')).toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.rpc.mock.calls[1][1].p_request_id).toBe(state.rpc.mock.calls[0][1].p_request_id);
  });

  it('retains the original identity on a payload conflict instead of issuing a new sale',async()=>{
    const saved=prepareCheckout('barbershop',state.user.id,payload,receipt,null);
    state.rpc.mockResolvedValue({data:null,error:{code:'P0001',details:'IDEMPOTENCY_CONFLICT',message:'Solicitud duplicada con datos diferentes'}});
    render(<BarbershopPOS/>);
    fireEvent.click(await screen.findByRole('button',{name:'Verificar venta pendiente'}));
    await waitFor(()=>expect(state.rpc).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button',{name:'Verificar venta pendiente'})).toBeInTheDocument();
    expect(readPendingBarberSale(state.user.id)?.id).toBe(saved.id);
    expect(screen.getByRole('button',{name:'COBRAR'})).toBeDisabled();
  });

  it('does not send a sale if its recovery record cannot be written',async()=>{
    render(<BarbershopPOS/>);
    await openCheckout();
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage full');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('does not display a previous cashier\'s late receipt after switching users',async()=>{
    let finish!: (value:unknown)=>void;
    state.rpc.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    const view=render(<BarbershopPOS/>);
    await openCheckout();
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    state.user.id='cashier-2';
    view.rerender(<BarbershopPOS/>);
    await act(async()=>{finish(success);});
    expect(screen.queryByText('Recibo confirmado')).not.toBeInTheDocument();
    expect(state.printed).not.toHaveBeenCalled();
    expect(readPendingBarberSale('cashier-1')?.state).toBe('pending');
    expect(readPendingBarberSale('cashier-2')).toBeNull();
  });
});
