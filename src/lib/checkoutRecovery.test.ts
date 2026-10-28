import { describe, expect, it } from 'vitest';
import {
  acknowledgeCheckout, checkoutKey, draftKey, isDefinitiveSaleRejection, isRetryableTransportFailure,
  migrateBarberRecovery, prepareCheckout, readCheckout, readDraft, updateCheckout, writeDraft,
} from './checkoutRecovery';
const payload={payment:{method:'cash',amount:150,currency:'NIO',received:200,change:50},items:[{name:'Corte'}]};
const receipt={customer:null,items:[{name:'Corte'}],subtotal:150,discount:0};
const draft={ticketItems:[{name:'Corte'}],customer:null};
const result={success:true as const,ticket:{id:10,business_line:'barbershop',ticket_number:'B-ONE'}};
const prepare=()=>prepareCheckout('barbershop','one',payload,receipt,draft);

describe('durable sale records',()=>{
  it('persists an immutable request through session loss and refuses another unresolved sale',()=>{
    const mutable=structuredClone(payload),saved=prepareCheckout('barbershop','one',mutable,receipt,draft);
    mutable.payment.amount=999;sessionStorage.clear();
    expect(readCheckout('barbershop','one')).toEqual(saved);
    expect(saved.payload).toEqual(payload);
    expect(()=>prepare()).toThrow('cobro por verificar');
  });
  it('isolates users and modules and creates a new identity only after acknowledgement',()=>{
    const first=prepare();
    expect(readCheckout('barbershop','two')).toBeNull();
    expect(readCheckout('car_wash','one')).toBeNull();
    expect(()=>acknowledgeCheckout('barbershop','one')).toThrow('sin confirmar');
    updateCheckout(first,{state:'confirmed',result});
    writeDraft('barbershop','one',draft);
    acknowledgeCheckout('barbershop','one');
    expect(readDraft('barbershop','one')).toBeNull();
    expect(prepare().id).not.toBe(first.id);
  });
  it('keeps the same identity after rollback and rejects stale changes to an amended payload',()=>{
    const first=prepare();updateCheckout(first,{state:'rejected',error:'Stock insuficiente'});
    const corrected=prepareCheckout('barbershop','one',{...payload,payment:{...payload.payment,received:250,change:100}},receipt,draft);
    expect(corrected.id).toBe(first.id);
    expect(()=>updateCheckout(first,{state:'rejected'})).toThrow('cambió');
    expect(readCheckout('barbershop','one')).toEqual(corrected);
  });
  it('a late error cannot overwrite a confirmed result',()=>{
    const first=prepare();updateCheckout(first,{state:'confirmed',result});
    expect(updateCheckout(first,{state:'rejected',error:'Late failure'}).state).toBe('confirmed');
    expect(readCheckout('barbershop','one')?.result).toEqual(result);
  });
  it('keeps the confirmed result until the receipt is explicitly acknowledged',()=>{
    const first=prepare();updateCheckout(first,{state:'confirmed',result});
    expect(()=>prepare()).toThrow();
    sessionStorage.clear();
    expect(readCheckout('barbershop','one')?.result).toEqual(result);
  });
  it('does not overwrite corrupted request or draft data',()=>{
    localStorage.setItem(checkoutKey('barbershop','one'),'invalid');
    expect(()=>prepare()).toThrow();
    expect(localStorage.getItem(checkoutKey('barbershop','one'))).toBe('invalid');
    localStorage.setItem(draftKey('barbershop','one'),'{}');
    expect(()=>readDraft('barbershop','one')).toThrow();
  });
  it('migrates the former session record only after writing a durable copy',()=>{
    const old={version:1,id:crypto.randomUUID(),userId:'one',state:'pending',payload,receipt};
    const key='pos:barbershop:pending-sale:v1:one';sessionStorage.setItem(key,JSON.stringify(old));
    migrateBarberRecovery('one');
    expect(readCheckout('barbershop','one')).toMatchObject({...old,version:2,businessLine:'barbershop',draft:null});
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('never discards two different pending recovery records during migration',()=>{
    const saved=prepare(),key='pos:barbershop:pending-sale:v1:one';
    sessionStorage.setItem(key,JSON.stringify({...saved,version:1,id:crypto.randomUUID()}));
    expect(()=>migrateBarberRecovery('one')).toThrow('dos cobros');
    expect(readCheckout('barbershop','one')).toEqual(saved);
    expect(sessionStorage.getItem(key)).not.toBeNull();
  });
});

describe('failure classification',()=>{
  it('keeps both old and new RPC identity conflicts unresolved',()=>{
    expect(isDefinitiveSaleRejection({code:'P0001',details:'IDEMPOTENCY_CONFLICT'})).toBe(false);
    expect(isDefinitiveSaleRejection({code:'P0001',message:'La solicitud ya existe con otros datos. Reintenta con los datos originales.'})).toBe(false);
    expect(isRetryableTransportFailure({code:'P0001',details:'IDEMPOTENCY_CONFLICT'})).toBe(false);
  });
  it('distinguishes transaction rejections, network failures and authentication failures',()=>{
    for(const code of ['P0001','23514','23503','22003','42501','40001','40P01']) expect(isDefinitiveSaleRejection({code})).toBe(true);
    for(const error of [new Error('Failed to fetch'),{code:'08007'},{code:'40003'},{code:'PGRST000'},{status:504}]) expect(isDefinitiveSaleRejection(error)).toBe(false);
    expect(isRetryableTransportFailure({code:'PGRST000'})).toBe(true);
    expect(isRetryableTransportFailure({code:'PGRST301'})).toBe(false);
  });
});
