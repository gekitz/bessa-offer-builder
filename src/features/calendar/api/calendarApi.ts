// Thin facade for the unified calendar — re-exports the source APIs
// so the calendar feature has a single import surface and can be
// mocked in tests without touching the per-feature API files.

export { listAppointments } from '../../tickets/api/ticketApi';
export { listLeaveRequests, listEmployees, listLeaveTypes } from '../../vacation/api/vacationApi';
export { listShifts, listSlotKinds, listBankHolidays } from '../../shifts/api/shiftApi';
