import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const addEntryMock = vi.fn();
const updateEntryMock = vi.fn();
const deleteEntryMock = vi.fn();
const listServiceRatesMock = vi.fn();
const listTravelZonesMock = vi.fn();

const fetchTripsMock = vi.fn();
const listVehicleAssignmentsMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  addEntry: (roId: string, input: unknown) => addEntryMock(roId, input),
  updateEntry: (id: string, patch: unknown) => updateEntryMock(id, patch),
  deleteEntry: (id: string) => deleteEntryMock(id),
  listServiceRates: () => listServiceRatesMock(),
  listTravelZones: () => listTravelZonesMock(),
}));

vi.mock('../../api/webfleetApi', () => ({
  fetchTrips: (objectno: string, date: string) => fetchTripsMock(objectno, date),
  listVehicleAssignments: () => listVehicleAssignmentsMock(),
}));

import TimeEntryForm from '../TimeEntryForm';
import type { Employee } from '../../../vacation/types';
import type { VehicleAssignment } from '../../types';

const EMPLOYEES: Employee[] = [
  { id: 'emp-a', code: 'a', name: 'Hannes Huber', standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true },
  { id: 'emp-b', code: 'b', name: 'Klaus Weber',  standortId: 1, weeklyHours: 38.5, employmentType: 'fulltime', active: true },
];

beforeEach(() => {
  addEntryMock.mockReset().mockResolvedValue({ id: 'e-new' });
  updateEntryMock.mockReset();
  deleteEntryMock.mockReset();
  listServiceRatesMock.mockReset().mockResolvedValue([
    { id: 1, code: 'PC_NB', label: 'PC/NB', category: 'it', unit: 'hour', rate: 130, tierMinHours: null, requiresWartungsvertrag: null, mesonicArtikelNr: null, activeFrom: '2026-01-01', activeTo: null },
    { id: 2, code: 'NETZWERK', label: 'Netzwerk', category: 'it', unit: 'hour', rate: 175, tierMinHours: null, requiresWartungsvertrag: null, mesonicArtikelNr: null, activeFrom: '2026-01-01', activeTo: null },
  ]);
  listTravelZonesMock.mockReset().mockResolvedValue([
    { id: 1, code: 'STADT', label: 'Stadt', maxKm: null, flatRate: 32, mesonicArtikelNr: '31000000', activeFrom: '2026-01-01' },
  ]);
  // Default: technician has no vehicle assigned → no trip suggestions.
  listVehicleAssignmentsMock.mockReset().mockResolvedValue([]);
  fetchTripsMock.mockReset().mockResolvedValue([]);
});

describe('TimeEntryForm', () => {
  it('converts hours + minutes into total work_minutes', async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <TimeEntryForm
        repairOrderId="ro-1"
        performedAt="2026-07-08"
        employees={EMPLOYEES}
        defaultEmployeeId="emp-a"
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(listServiceRatesMock).toHaveBeenCalled());

    // Default work hours/mins are 0 — set to 1h 30min
    await u.clear(screen.getByTestId('work-hours'));
    await u.type(screen.getByTestId('work-hours'), '1');
    await u.clear(screen.getByTestId('work-mins'));
    await u.type(screen.getByTestId('work-mins'), '30');

    await u.click(screen.getByRole('button', { name: /Hinzufügen/ }));

    await waitFor(() => expect(addEntryMock).toHaveBeenCalledTimes(1));
    const [roId, input] = addEntryMock.mock.calls[0];
    expect(roId).toBe('ro-1');
    expect(input.workMinutes).toBe(90); // 1*60 + 30
    expect(input.employeeId).toBe('emp-a');
    expect(input.serviceRateCode).toBe('PC_NB');
    expect(input.travelMode).toBe('none');
  });

  it('blocks save when neither work time nor travel is recorded', async () => {
    const u = userEvent.setup();
    render(
      <TimeEntryForm
        repairOrderId="ro-1"
        performedAt="2026-07-08"
        employees={EMPLOYEES}
        defaultEmployeeId="emp-a"
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(listServiceRatesMock).toHaveBeenCalled());
    await u.click(screen.getByRole('button', { name: /Hinzufügen/ }));
    expect(screen.getByText(/Arbeitszeit oder Anfahrt/)).toBeInTheDocument();
    expect(addEntryMock).not.toHaveBeenCalled();
  });

  it('requires a zone when travel mode is pauschale', async () => {
    const u = userEvent.setup();
    render(
      <TimeEntryForm
        repairOrderId="ro-1"
        performedAt="2026-07-08"
        employees={EMPLOYEES}
        defaultEmployeeId="emp-a"
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(listServiceRatesMock).toHaveBeenCalled());
    // Open the Anfahrt-Modus dropdown and pick "Pauschale (Zone)" —
    // the custom Select renders a button trigger + portaled listbox.
    await u.click(screen.getByRole('button', { name: 'Anfahrt-Modus' }));
    await u.click(screen.getByRole('option', { name: /KFZ-Pauschale/ }));
    await u.click(screen.getByRole('button', { name: /Hinzufügen/ }));
    expect(screen.getByText(/Bitte eine KFZ-Zone/)).toBeInTheDocument();
    expect(addEntryMock).not.toHaveBeenCalled();
  });

  it('sends km_plus_wegzeit with km + wegzeit minutes', async () => {
    const u = userEvent.setup();
    render(
      <TimeEntryForm
        repairOrderId="ro-1"
        performedAt="2026-07-08"
        employees={EMPLOYEES}
        defaultEmployeeId="emp-a"
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(listServiceRatesMock).toHaveBeenCalled());

    await u.click(screen.getByRole('button', { name: 'Anfahrt-Modus' }));
    await u.click(screen.getByRole('option', { name: /KM-Geld \+ Wegzeit/ }));

    // Set work to non-zero
    await u.clear(screen.getByTestId('work-hours'));
    await u.type(screen.getByTestId('work-hours'), '1');

    // KM input is the only text input with placeholder "0".
    const kmInput = screen.getByPlaceholderText('0');
    await u.type(kmInput, '50');

    await u.click(screen.getByRole('button', { name: /Hinzufügen/ }));
    await waitFor(() => expect(addEntryMock).toHaveBeenCalled());
    const [, input] = addEntryMock.mock.calls[0];
    expect(input.travelMode).toBe('km_plus_wegzeit');
    expect(input.travelKm).toBe(50);
    expect(input.travelZoneCode).toBeNull();
  });

  it('fills km + Wegzeit from a picked Webfleet trip', async () => {
    const assignment: VehicleAssignment = {
      id: 'va-1', employeeId: 'emp-a', webfleetObjectNo: '001',
      plate: 'K-1', label: 'Kangoo', validFrom: '2026-01-01', validTo: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    listVehicleAssignmentsMock.mockResolvedValue([assignment]);
    fetchTripsMock.mockResolvedValue([
      {
        tripId: 't-9', objectno: '001', objectName: 'Kangoo', driverName: 'HuberH',
        startTime: '2026-07-08T08:10:15', endTime: '2026-07-08T08:49:29',
        km: 50.17, durationMinutes: 39,
        startAddress: 'Start 1', endAddress: 'Kundenstr. 5, Griffen',
      },
    ]);

    const u = userEvent.setup();
    render(
      <TimeEntryForm
        repairOrderId="ro-1"
        performedAt="2026-07-08"
        employees={EMPLOYEES}
        defaultEmployeeId="emp-a"
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(listServiceRatesMock).toHaveBeenCalled());

    await u.click(screen.getByRole('button', { name: 'Anfahrt-Modus' }));
    await u.click(screen.getByRole('option', { name: /KM-Geld \+ Wegzeit/ }));

    // Trip loads for the assigned vehicle on the service date.
    const tripBtn = await screen.findByRole('button', { name: /50,17 km/ });
    expect(fetchTripsMock).toHaveBeenCalledWith('001', '2026-07-08');
    await u.click(tripBtn);

    await u.click(screen.getByRole('button', { name: /Hinzufügen/ }));
    await waitFor(() => expect(addEntryMock).toHaveBeenCalled());
    const [, input] = addEntryMock.mock.calls[0];
    expect(input.travelKm).toBeCloseTo(50.17, 2);
    expect(input.travelWegzeitMinutes).toBe(39);
    expect(input.note).toContain('Webfleet:');
  });
});
