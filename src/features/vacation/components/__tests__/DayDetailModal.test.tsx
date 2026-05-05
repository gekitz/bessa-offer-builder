import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayDetailModal from '../DayDetailModal';
import type { Employee, LeaveRequest, LeaveTypeCode } from '../../types';
import type { LeaveType } from '../../api/vacationApi';

const stefan: Employee = {
  id: 'sbauer-id', code: 'sbauer', name: 'Stefan Bauer',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};
const mario: Employee = {
  id: 'mgraf-id', code: 'mgraf', name: 'Mario Graf',
  standortId: 2, weeklyHours: 38.5, employmentType: 'fulltime', active: true,
};

const employees = new Map<string, Employee>([[stefan.id, stefan], [mario.id, mario]]);
const leaveTypes = new Map<LeaveTypeCode, LeaveType>([
  ['urlaub',       { id: 1, code: 'urlaub',       label: 'Urlaub',       deductsFromBalance: true }],
  ['krankenstand', { id: 3, code: 'krankenstand', label: 'Krankenstand', deductsFromBalance: false }],
]);

describe('DayDetailModal', () => {
  it('shows the German-formatted day in the header with the absence count', () => {
    const leaves: Array<LeaveRequest & { id: string }> = [
      {
        id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub',
        startDate: '2026-08-10', endDate: '2026-08-15', status: 'approved',
      },
    ];
    render(
      <DayDetailModal day="2026-08-12" leaves={leaves} employees={employees} leaveTypes={leaveTypes} onClose={() => {}} />,
    );
    expect(screen.getByText('12.08.2026')).toBeInTheDocument();
    expect(screen.getByText('(1 Abwesenheit)')).toBeInTheDocument();
  });

  it('uses the plural form when more than one leave is shown', () => {
    const leaves: Array<LeaveRequest & { id: string }> = [
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub',       startDate: '2026-08-10', endDate: '2026-08-15', status: 'approved' },
      { id: '2', employeeId: mario.id,  leaveTypeCode: 'krankenstand', startDate: '2026-08-12', endDate: '2026-08-12', status: 'pending' },
    ];
    render(
      <DayDetailModal day="2026-08-12" leaves={leaves} employees={employees} leaveTypes={leaveTypes} onClose={() => {}} />,
    );
    expect(screen.getByText('(2 Abwesenheiten)')).toBeInTheDocument();
  });

  it('renders one row per leave with employee name + type label + range + status', () => {
    const leaves: Array<LeaveRequest & { id: string }> = [
      { id: '1', employeeId: stefan.id, leaveTypeCode: 'urlaub',       startDate: '2026-08-10', endDate: '2026-08-15', status: 'approved' },
      { id: '2', employeeId: mario.id,  leaveTypeCode: 'krankenstand', startDate: '2026-08-12', endDate: '2026-08-12', status: 'pending' },
    ];
    render(
      <DayDetailModal day="2026-08-12" leaves={leaves} employees={employees} leaveTypes={leaveTypes} onClose={() => {}} />,
    );
    expect(screen.getByText('Stefan Bauer')).toBeInTheDocument();
    expect(screen.getByText('Urlaub')).toBeInTheDocument();
    expect(screen.getByText(/10\.08\.2026.*15\.08\.2026/)).toBeInTheDocument();
    expect(screen.getByText('Genehmigt')).toBeInTheDocument();

    expect(screen.getByText('Mario Graf')).toBeInTheDocument();
    expect(screen.getByText('Krankenstand')).toBeInTheDocument();
    // "12.08.2026" appears twice — once in the header and once on
    // Mario's single-day Krankenstand row.
    expect(screen.getAllByText('12.08.2026')).toHaveLength(2);
    expect(screen.getByText('Offen')).toBeInTheDocument();
  });

  it('renders the optional reason and substitute', () => {
    const leaves: Array<LeaveRequest & { id: string }> = [
      {
        id: '1',
        employeeId: stefan.id,
        leaveTypeCode: 'urlaub',
        startDate: '2026-08-10',
        endDate: '2026-08-15',
        status: 'approved',
        reason: 'Sommerurlaub',
        substituteId: mario.id,
      },
    ];
    render(
      <DayDetailModal day="2026-08-12" leaves={leaves} employees={employees} leaveTypes={leaveTypes} onClose={() => {}} />,
    );
    expect(screen.getByText(/Sommerurlaub/)).toBeInTheDocument();
    expect(screen.getByText(/Vertretung:/)).toBeInTheDocument();
  });

  it('shows the empty state when no leaves overlap the day', () => {
    render(
      <DayDetailModal day="2026-08-12" leaves={[]} employees={employees} leaveTypes={leaveTypes} onClose={() => {}} />,
    );
    expect(screen.getByText(/Niemand abwesend an diesem Tag/)).toBeInTheDocument();
  });

  it('closes via the X button, the backdrop, and Escape', async () => {
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(
      <DayDetailModal day="2026-08-12" leaves={[]} employees={employees} leaveTypes={leaveTypes} onClose={onClose} />,
    );

    await u.click(screen.getByLabelText('Schließen'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('day-detail-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
