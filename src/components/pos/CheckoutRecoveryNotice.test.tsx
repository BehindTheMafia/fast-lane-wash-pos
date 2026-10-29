import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CheckoutRecoveryNotice from './CheckoutRecoveryNotice';

describe('duplicate sale notice', () => {
  it('shows the original ticket and review option without an automatic retry or payment action', () => {
    const retry=vi.fn(),dismissDuplicate=vi.fn();
    render(<CheckoutRecoveryNotice ready issue={null} processing={false} online retry={retry} backup={()=>''}
      dismissDuplicate={dismissDuplicate} record={{state:'rejected',duplicateSale:{ticketId:4407,ticketNumber:'T-ORIGINAL',
        businessLine:'car_wash',retryAfterSeconds:18}}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('T-ORIGINAL');
    expect(screen.getByRole('link',{name:'Revisar o reimprimir en Reportes'})).toHaveAttribute('href','/reports');
    expect(screen.queryByRole('button',{name:/Verificar venta/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Volver al POS'}));
    expect(dismissDuplicate).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();
  });
});
