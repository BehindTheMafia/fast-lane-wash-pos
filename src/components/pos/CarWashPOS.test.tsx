import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CarWashPOS from './CarWashPOS';
import { readCheckout } from '@/lib/checkoutRecovery';

const state=vi.hoisted(()=>({
  rpc:vi.fn(),from:vi.fn(),invalidate:vi.fn(),printed:vi.fn(),queryClient:{},
  services:[{id:1,name:'Servicio Premium',service_prices:[{vehicle_type_id:1,service_id:1,price:250}]}],
  vehicles:[{id:1,name:'Sedán',icon:'fa-car'}],settings:{exchange_rate:36.5},rewards:[],memberships:[],
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args: unknown[])=>({abortSignal:()=>state.rpc(...args)}),from:state.from}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>state.queryClient}));
vi.mock('@/lib/ticketMutation',()=>({invalidateTicketData:state.invalidate}));
vi.mock('@/hooks/useTicketRefresh',()=>({useTicketRefresh:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'cashier-1'},isAdmin:false,isOwner:false})}));
vi.mock('@/hooks/useServices',()=>({useServices:()=>({data:state.services}),useExtras:()=>({data:[]}),useBarberServicesForMix:()=>({data:[]})}));
vi.mock('@/hooks/useVehicleTypes',()=>({useVehicleTypes:()=>({data:state.vehicles})}));
vi.mock('@/hooks/useBusinessSettings',()=>({useBusinessSettings:()=>({data:state.settings})}));
vi.mock('@/contexts/BusinessLineContext',()=>({useBusinessLine:()=>({barbershopVisible:true})}));
vi.mock('@/hooks/useMemberships',()=>({useMemberships:()=>({memberships:state.memberships,getMembershipWithStatus:()=>({status:'active'})})}));
vi.mock('@/hooks/useLoyaltyV3',()=>({useAvailableRewards:()=>({data:state.rewards}),findBlockingReward:()=>null,REWARD_SERVICE_MAP:{},REWARD_DISCOUNT_MAP:{}}));
vi.mock('./MembershipSelector',()=>({default:()=>null}));
vi.mock('./LoyaltySelector',()=>({default:()=>null}));
vi.mock('@/components/loyalty/RewardBlockModal',()=>({default:()=>null}));
vi.mock('./CustomerModal',()=>({default:()=>null}));
vi.mock('./TicketPrint',()=>({default:({ticket,onClose}:{ticket:unknown;onClose:()=>void})=>{state.printed(ticket);return <button onClick={onClose}>Cerrar recibo confirmado</button>;}}));

const success={data:{success:true,ticket:{id:10,business_line:'car_wash',ticket_number:'T-OK',total:250,status:'paid'},rewards_earned:[]},error:null};
const customer={id:1,name:'Cliente general',plate:'',phone:'',is_general:true};
beforeEach(()=>{
  state.settings.exchange_rate=36.5;
  sessionStorage.clear();state.rpc.mockReset();state.from.mockReset();state.invalidate.mockReset();state.printed.mockClear();
  state.invalidate.mockResolvedValue(undefined);
  vi.spyOn(console,'log').mockImplementation(()=>{});
  state.from.mockImplementation(()=>{
    const query:{[key:string]:unknown}={};
    for(const name of ['select','eq','gte','order']) query[name]=vi.fn(()=>query);
    query.maybeSingle=()=>Promise.resolve({data:customer,error:null});
    query.limit=()=>Promise.resolve({data:[],error:null});
    return query;
  });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function addService(){
  await screen.findByText('Cliente general');
  fireEvent.click(screen.getByRole('button',{name:'Sedán'}));
  fireEvent.click(screen.getByRole('button',{name:/Servicio Premium C\$250/}));
  fireEvent.click(screen.getByRole('button',{name:'Agregar al ticket'}));
}
async function openPayment(){
  await addService();
  fireEvent.click(screen.getByRole('button',{name:'COBRAR'}));
  fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:'300'}});
}

describe('car wash checkout tests',()=>{
  it('double click sends once; retry after a lost response keeps the same identity and payload while mounted',async()=>{
    let finish!: (value:unknown)=>void;
    state.rpc.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(success);
    render(<CarWashPOS/>);
    await openPayment();
    const confirm=screen.getByRole('button',{name:'Confirmar Pago'});
    fireEvent.click(confirm);fireEvent.click(confirm);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    await act(async()=>{finish({data:null,error:{message:'Failed to fetch'}});});
    const retry=await screen.findByRole('button',{name:'Verificar venta pendiente'});
    expect(state.printed).not.toHaveBeenCalled();
    fireEvent.click(retry);
    expect(await screen.findByRole('button',{name:'Cerrar recibo confirmado'})).toBeInTheDocument();
    expect(state.rpc.mock.calls[1]).toEqual(state.rpc.mock.calls[0]);
    expect(state.invalidate).toHaveBeenCalledTimes(1);
  });

  it('stock rejection keeps the cart and allows retrying the same request',async()=>{
    state.rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',message:'Stock insuficiente'}}).mockResolvedValueOnce(success);
    render(<CarWashPOS/>);await openPayment();
    const confirm=screen.getByRole('button',{name:'Confirmar Pago'});fireEvent.click(confirm);
    expect(await screen.findByText('Stock insuficiente')).toBeInTheDocument();
    expect(state.printed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'COBRAR'}));
    fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:'300'}});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    expect(await screen.findByRole('button',{name:'Cerrar recibo confirmado'})).toBeInTheDocument();
    expect(state.rpc.mock.calls[1][1].p_request_id).toBe(state.rpc.mock.calls[0][1].p_request_id);
  });

  it('the next legitimate identical sale uses a different request identity',async()=>{
    state.rpc.mockResolvedValue(success);
    render(<CarWashPOS/>);await openPayment();fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    fireEvent.click(await screen.findByRole('button',{name:'Cerrar recibo confirmado'}));
    await openPayment();fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    expect(await screen.findByRole('button',{name:'Cerrar recibo confirmado'})).toBeInTheDocument();
    expect(state.rpc.mock.calls[1][1].p_request_id).not.toBe(state.rpc.mock.calls[0][1].p_request_id);
    expect(state.rpc.mock.calls[1][1].p_payload).toEqual(state.rpc.mock.calls[0][1].p_payload);
  });

  it('post-commit refresh failure still confirms the receipt and never resubmits the payment',async()=>{
    state.rpc.mockResolvedValue(success);
    state.invalidate.mockRejectedValueOnce(new Error('Refresh failed'));
    render(<CarWashPOS/>);await openPayment();
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    expect(await screen.findByRole('button',{name:'Cerrar recibo confirmado'})).toBeInTheDocument();
    expect(await screen.findByText('Venta confirmada. La actualización del panel está pendiente.')).toBeInTheDocument();
    expect(readCheckout('car_wash','cashier-1')?.state).toBe('confirmed');
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it('recovers the exact uncertain request after closing the tab, without rebuilding the ticket',async()=>{
    state.rpc.mockResolvedValueOnce({data:null,error:{message:'Failed to fetch'}}).mockResolvedValueOnce(success);
    const view=render(<CarWashPOS/>);await openPayment();fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    await screen.findByRole('button',{name:'Verificar venta pendiente'});
    const original=state.rpc.mock.calls[0][1];
    view.unmount(); sessionStorage.clear();
    render(<CarWashPOS/>);
    fireEvent.click(await screen.findByRole('button',{name:'Verificar venta pendiente'}));
    expect(await screen.findByRole('button',{name:'Cerrar recibo confirmado'})).toBeInTheDocument();
    expect(state.rpc.mock.calls[1][1]).toEqual(original);
  });

  it('restores an unpaid draft, including its discount, without sending a sale',async()=>{
    const view=render(<CarWashPOS/>);await addService();
    fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'20'}});
    view.unmount(); sessionStorage.clear();state.settings.exchange_rate=40;
    state.rpc.mockResolvedValue(success);
    render(<CarWashPOS/>);
    await waitFor(()=>expect(screen.getByRole('spinbutton')).toHaveValue(20));
    expect(screen.getAllByText('C$200.00').length).toBeGreaterThan(0);
    expect(state.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'COBRAR'}));
    fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:'300'}});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
    await screen.findByRole('button',{name:'Cerrar recibo confirmado'});
    expect(state.rpc.mock.calls[0][1].p_payload.exchange_rate).toBe(36.5);
  });
});
