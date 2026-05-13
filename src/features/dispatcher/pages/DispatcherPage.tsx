// DispatcherPage ("Leitstelle") — single-screen call-intake view.
//
// One-pane workflow:
//   1. Dispatcher answers the phone → types the caller's name/number in
//      the left search panel.
//   2. Picks a customer card → middle panel shows that customer's open
//      tickets + a "Neues Ticket" button.
//   3. Right panel: pick a slot duration, hit "Slots finden", read the
//      next available technician windows back to the caller, then click
//      a slot pill. A compact QuickBookConfirm modal opens, with a
//      conflict-check banner if the chosen slot now overlaps something
//      else (rare, but catches races between two dispatchers).
//
// All three panels live on one screen so the dispatcher never has to
// context-switch between CRM / Tickets / Kalender during a live call.

import { useEffect, useMemo, useState } from 'react';
import DispatcherSearchPanel, { type DispatcherCustomer } from '../components/DispatcherSearchPanel';
import DispatcherCustomerPanel from '../components/DispatcherCustomerPanel';
import DispatcherAvailabilityPanel from '../components/DispatcherAvailabilityPanel';
import QuickBookConfirm from '../components/QuickBookConfirm';
import TicketForm from '../../tickets/components/TicketForm';
import { useAvailability, type UseAvailabilityOptions } from '../hooks/useAvailability';
import { listEmployees } from '../../calendar/api/calendarApi';
import type { Employee } from '../../vacation/types';
import type { Ticket } from '../../tickets/types';
import type { FreeSlot } from '../lib/availability';

export default function DispatcherPage() {
  const [customer, setCustomer] = useState<DispatcherCustomer | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [customerTicketsKey, setCustomerTicketsKey] = useState(0);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<FreeSlot | null>(null);
  const [lastSearchOptions, setLastSearchOptions] = useState<UseAvailabilityOptions | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const availability = useAvailability();

  useEffect(() => {
    let cancelled = false;
    listEmployees({ activeOnly: true })
      .then((data) => {
        if (!cancelled) setEmployees(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const employeeNameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  function handlePickCustomer(next: DispatcherCustomer) {
    if (next.mesonicId === customer?.mesonicId) return;
    setCustomer(next);
    setSelectedTicket(null);
  }

  function handleCreateTicket() {
    setShowTicketForm(true);
  }

  function handleTicketSaved(saved: Ticket) {
    setShowTicketForm(false);
    setSelectedTicket(saved);
    setCustomerTicketsKey((k) => k + 1);
  }

  function handleFindSlots(opts: UseAvailabilityOptions) {
    setLastSearchOptions(opts);
    void availability.refetch(opts);
  }

  function handlePickSlot(slot: FreeSlot) {
    setBookingSlot(slot);
  }

  function handleBookingSaved() {
    setBookingSlot(null);
    if (lastSearchOptions) {
      void availability.refetch(lastSearchOptions);
    }
  }

  return (
    <div className="flex flex-col h-full md:flex-row" data-testid="dispatcher-page">
      <div className="md:w-[280px] md:flex-shrink-0 h-[40%] md:h-full">
        <DispatcherSearchPanel onPick={handlePickCustomer} selectedMesonicId={customer?.mesonicId} />
      </div>
      <div className="flex-1 min-w-0 h-[30%] md:h-full">
        <DispatcherCustomerPanel
          key={customerTicketsKey}
          customer={customer}
          selectedTicketId={selectedTicket?.id ?? null}
          onSelectTicket={setSelectedTicket}
          onCreateTicket={handleCreateTicket}
        />
      </div>
      <div className="flex-1 min-w-0 h-[30%] md:h-full">
        <DispatcherAvailabilityPanel
          slots={availability.slots}
          loading={availability.loading}
          error={availability.error}
          hasRun={availability.hasRun}
          onFindSlots={handleFindSlots}
          onPickSlot={handlePickSlot}
        />
      </div>

      {showTicketForm && customer && (
        <TicketForm
          initialCustomer={{
            company: customer.company,
            name: customer.contactName,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            mesonicId: customer.mesonicId,
          }}
          onSaved={handleTicketSaved}
          onClose={() => setShowTicketForm(false)}
        />
      )}

      {bookingSlot && (
        <QuickBookConfirm
          slot={bookingSlot}
          employeeName={employeeNameById.get(bookingSlot.employeeId) ?? bookingSlot.employeeId}
          customer={customer}
          ticket={selectedTicket}
          appointments={availability.appointments}
          onSaved={handleBookingSaved}
          onClose={() => setBookingSlot(null)}
        />
      )}
    </div>
  );
}
