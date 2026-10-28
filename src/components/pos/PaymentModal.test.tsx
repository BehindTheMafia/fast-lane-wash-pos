import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PaymentModal from './PaymentModal';

describe('payment submission', () => {
  it('prevents double submission and closing while saving, then allows a retry', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onClose = vi.fn();
    const { container } = render(<PaymentModal total={150} exchangeRate={36.5} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '200' } });
    const button = screen.getByRole('button', { name: 'Confirmar Pago' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(container.firstElementChild!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ method:'cash', currency:'NIO', amount:150, received:200, change:50 });
    expect(onClose).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    // The parent handles an unsuccessful save and keeps the modal open.
    await act(async () => { finish(); });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(2);
    await act(async () => { finish(); });
  });
});
