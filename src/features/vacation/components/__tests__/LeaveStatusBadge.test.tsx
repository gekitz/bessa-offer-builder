import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LeaveStatusBadge from '../LeaveStatusBadge';

describe('LeaveStatusBadge', () => {
  it.each([
    ['pending',   'Offen'],
    ['approved',  'Genehmigt'],
    ['rejected',  'Abgelehnt'],
    ['cancelled', 'Storniert'],
  ] as const)('renders the German label for status=%s', (status, label) => {
    render(<LeaveStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('applies the matching color class for each status', () => {
    const { rerender } = render(<LeaveStatusBadge status="pending" />);
    expect(screen.getByText('Offen').className).toMatch(/bg-amber/);
    rerender(<LeaveStatusBadge status="approved" />);
    expect(screen.getByText('Genehmigt').className).toMatch(/bg-emerald/);
    rerender(<LeaveStatusBadge status="rejected" />);
    expect(screen.getByText('Abgelehnt').className).toMatch(/bg-red/);
    rerender(<LeaveStatusBadge status="cancelled" />);
    expect(screen.getByText('Storniert').className).toMatch(/bg-slate/);
  });
});
