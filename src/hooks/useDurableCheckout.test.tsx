import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDurableCheckout } from './useDurableCheckout';
import { checkoutKey, draftKey, prepareCheckout, readCheckout, readDraft, updateCheckout, writeDraft } from '@/lib/checkoutRecovery';

const network=vi.hoisted(()=>({rpc:vi.fn(),signals:[] as AbortSignal[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>({abortSignal:(signal:AbortSignal)=>{
  network.signals.push(signal);return network.rpc(...args);
}})}}));
const payload={payment:{method:'cash',amount:250,currency:'NIO',received:300,change:50},items:[{name:'Lavado'}]};
const receipt={customer:{id:1},items:[{name:'Lavado'}],subtotal:250,discount:0};
const initialDraft={ticketItems:[{name:'Lavado'}],discount:0};
const success={data:{success:true as const,ticket:{id:10,business_line:'car_wash',total:250,ticket_number:'T-OK'}},error:null};
function mount(userId='one',line:'car_wash'|'barbershop'='car_wash'){
  const callbacks={restore:vi.fn(),confirmed:vi.fn(),rejected:vi.fn()};
  const view=renderHook(({draft})=>useDurableCheckout({businessLine:line,userId,draft,...callbacks}),{initialProps:{draft:initialDraft}});
  return {...view,...callbacks};
}
async function flush(){await act(async()=>{await Promise.resolve();});}
async function advance(ms:number){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});}
beforeEach(()=>{vi.useFakeTimers();network.rpc.mockReset();network.rpc.mockResolvedValue(success);network.signals=[];});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

describe('connection-loss recovery',()=>{
  it('saves an offline sale without sending or marking it paid, then confirms the same identity on reconnection',async()=>{
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
    const view=mount();await flush();
    await act(async()=>{await view.result.current.start(payload,receipt);});
    const saved=readCheckout('car_wash','one');
    expect(saved?.state).toBe('pending');expect(network.rpc).not.toHaveBeenCalled();expect(view.confirmed).not.toHaveBeenCalled();
    Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
    act(()=>{window.dispatchEvent(new Event('online'));});
    await advance(1000);
    expect(network.rpc).toHaveBeenCalledWith('complete_car_wash_sale',{p_request_id:saved?.id,p_payload:payload});
    expect(readCheckout('car_wash','one')?.state).toBe('confirmed');expect(view.confirmed).toHaveBeenCalledTimes(1);
  });

  it('times out a hung call after 20 seconds, then retries with the exact same identity and ignores the late result',async()=>{
    let late!: (value:unknown)=>void;
    network.rpc.mockReturnValueOnce(new Promise(resolve=>{late=resolve;})).mockResolvedValueOnce(success);
    const view=mount();await flush();
    act(()=>{void view.result.current.start(payload,receipt);});await flush();
    expect(view.result.current.processing).toBe(true);
    await advance(20_000);
    expect(network.signals[0].aborted).toBe(true);expect(view.result.current.processing).toBe(false);
    expect(readCheckout('car_wash','one')?.state).toBe('pending');
    await advance(1000);
    expect(network.rpc.mock.calls[1]).toEqual(network.rpc.mock.calls[0]);
    await act(async()=>{late({data:null,error:{code:'P0001',message:'Late rejection'}});});
    expect(readCheckout('car_wash','one')?.state).toBe('confirmed');expect(view.confirmed).toHaveBeenCalledTimes(1);
  });

  it('uses three bounded automatic retries and leaves a manual recovery option afterwards',async()=>{
    network.rpc.mockResolvedValue({data:null,error:{message:'Network unavailable'}});
    const view=mount();await flush();
    await act(async()=>{await view.result.current.start(payload,receipt);});
    await advance(1000);await advance(3000);await advance(8000);
    expect(network.rpc).toHaveBeenCalledTimes(4);
    await advance(60_000);expect(network.rpc).toHaveBeenCalledTimes(4);
    expect(readCheckout('car_wash','one')?.state).toBe('pending');
    network.rpc.mockResolvedValue(success);
    await act(async()=>{await view.result.current.retry();});
    expect(network.rpc).toHaveBeenCalledTimes(5);expect(view.confirmed).toHaveBeenCalledTimes(1);
  });

  it('restores a pending sale after closing the tab and automatically verifies it from durable storage',async()=>{
    network.rpc.mockResolvedValueOnce({data:null,error:{message:'Failed to fetch'}});
    const first=mount();await flush();
    await act(async()=>{await first.result.current.start(payload,receipt);});
    const request=network.rpc.mock.calls[0][1];first.unmount();sessionStorage.clear();
    const next=mount();await flush();
    expect(next.restore).toHaveBeenCalledWith(initialDraft,expect.objectContaining({id:request.p_request_id,state:'pending'}));
    await advance(1000);
    expect(network.rpc.mock.calls[1][1]).toEqual(request);expect(next.confirmed).toHaveBeenCalledTimes(1);
  });

  it('preserves confirmed receipts through a crash without calling the server again',async()=>{
    const request=prepareCheckout('car_wash','one',payload,receipt,initialDraft);
    updateCheckout(request,{state:'confirmed',result:success.data});
    const view=mount();await flush();
    expect(view.confirmed).toHaveBeenCalledWith(expect.objectContaining({id:request.id,state:'confirmed'}),success.data);
    await advance(30_000);expect(network.rpc).not.toHaveBeenCalled();
    act(()=>{expect(view.result.current.acknowledge()).toBe(true);});
    expect(localStorage.getItem(checkoutKey('car_wash','one'))).toBeNull();
    expect(localStorage.getItem(draftKey('car_wash','one'))).toBeNull();
  });

  it('keeps the same identity for corrected attempts after a proven rollback; conflicts are never auto-retried',async()=>{
    network.rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',message:'Stock insuficiente'}});
    const view=mount();await flush();
    await act(async()=>{await view.result.current.start(payload,receipt);});
    const first=network.rpc.mock.calls[0][1];expect(view.result.current.blocked).toBe(false);
    await advance(30_000);expect(network.rpc).toHaveBeenCalledTimes(1);
    network.rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',details:'IDEMPOTENCY_CONFLICT',message:'La solicitud ya existe con otros datos'}});
    await act(async()=>{await view.result.current.start({...payload,payment:{...payload.payment,received:350,change:100}},receipt);});
    expect(network.rpc.mock.calls[1][1].p_request_id).toBe(first.p_request_id);
    expect(view.result.current.blocked).toBe(true);await advance(60_000);expect(network.rpc).toHaveBeenCalledTimes(2);
  });

  it('a storage failure prevents network writes and retains the existing draft',async()=>{
    const view=mount();await flush();
    const before=readDraft('car_wash','one');
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
    await act(async()=>{await view.result.current.start(payload,receipt);});
    expect(view.result.current.issue).toBe('Storage full');expect(network.rpc).not.toHaveBeenCalled();
    expect(readDraft('car_wash','one')).toEqual(before);
    expect(JSON.parse(view.result.current.backup())).toMatchObject({userId:'one',businessLine:'car_wash',draft:initialDraft});
  });

  it('restores the latest unpaid draft without an API call',async()=>{
    const view=mount();await flush();
    view.rerender({draft:{ticketItems:[{name:'Otro lavado'}],discount:20}});
    view.unmount();sessionStorage.clear();
    const next=mount();await flush();
    expect(next.restore).toHaveBeenCalledWith({ticketItems:[{name:'Otro lavado'}],discount:20},null);
    expect(network.rpc).not.toHaveBeenCalled();
  });

  it('grants only one editing tab per user/module and hands the stored work to the next tab',async()=>{
    const first=mount();await flush();const second=mount();await flush();
    expect(first.result.current.ready).toBe(true);expect(second.result.current.ready).toBe(false);
    await act(async()=>{await second.result.current.start(payload,receipt);});expect(network.rpc).not.toHaveBeenCalled();
    first.rerender({draft:{ticketItems:[{name:'Guardado en otra pestaña'}],discount:10}});first.unmount();await flush();
    expect(second.result.current.ready).toBe(true);
    expect(second.restore).toHaveBeenCalledWith({ticketItems:[{name:'Guardado en otra pestaña'}],discount:10},null);
  });

  it('does not mix users or business modules, and leaves a cancelled in-flight request recoverable',async()=>{
    network.rpc.mockReturnValueOnce(new Promise(()=>{}));
    const first=mount();await flush();act(()=>{void first.result.current.start(payload,receipt);});await flush();
    first.unmount();await flush();
    const otherUser=mount('two'),otherModule=mount('one','barbershop');await flush();
    expect(otherUser.result.current.record).toBeNull();expect(otherModule.result.current.record).toBeNull();
    expect(readCheckout('car_wash','one')?.state).toBe('pending');
    expect(network.signals[0].aborted).toBe(true);
  });

  it('does not send anything if native tab locking is unavailable',async()=>{
    Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});
    const view=mount();await flush();
    await act(async()=>{await view.result.current.start(payload,receipt);});
    expect(view.result.current.issue).toContain('navegador');expect(network.rpc).not.toHaveBeenCalled();
  });

  it('an unreadable draft remains stored and is never replaced by an empty ticket',async()=>{
    localStorage.setItem(draftKey('car_wash','one'),'invalid');
    const view=mount();await flush();
    expect(view.result.current.issue).not.toBeNull();
    expect(localStorage.getItem(draftKey('car_wash','one'))).toBe('invalid');
    expect(view.restore).not.toHaveBeenCalled();expect(network.rpc).not.toHaveBeenCalled();
  });

  it('a receipt rendering failure never changes a committed sale back to pending or resubmits it',async()=>{
    const view=mount();await flush();view.confirmed.mockImplementation(()=>{throw new Error('Printing failed');});
    await act(async()=>{await view.result.current.start(payload,receipt);});
    expect(view.result.current.issue).toContain('confirmada');
    expect(readCheckout('car_wash','one')?.state).toBe('confirmed');
    await advance(60_000);expect(network.rpc).toHaveBeenCalledTimes(1);
  });

  it('an incomplete or mismatched RPC response never confirms or discards the saved sale',async()=>{
    for (const [index, data] of [
      {success:false,ticket:{id:10,business_line:'car_wash'}},
      {success:true,ticket:{}},
      {success:true,ticket:{id:10,business_line:'barbershop'}},
    ].entries()) {
      network.rpc.mockResolvedValue({data,error:null});
      const view=mount(`invalid-${index}`);await flush();
      await act(async()=>{await view.result.current.start(payload,receipt);});
      expect(view.confirmed).not.toHaveBeenCalled();
      expect(readCheckout('car_wash',`invalid-${index}`)?.state).toBe('pending');
      view.unmount();
    }
  });
});
