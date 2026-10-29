import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TicketPrint from './TicketPrint';

const ticket={ticket_number:'T-ONE',created_at:'2026-10-29T12:00:00Z',total:150,subtotal:150,discount:0,
  customer:{name:'Cliente'},items:[{serviceName:'Corte',price:150}],payment:{method:'cash',currency:'NIO',amount:150,received:150,change:0}};

describe('finishing a POS receipt',()=>{
  it('requires an explicit new-attention action instead of an accidental backdrop click',()=>{
    const onClose=vi.fn();
    const {container}=render(<TicketPrint ticket={ticket} onClose={onClose} closeLabel="Nueva atención" closeOnBackdrop={false}/>);
    fireEvent.click(container.firstElementChild!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Nueva atención'}));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
