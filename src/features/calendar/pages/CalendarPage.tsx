// CalendarPage — central calendar that hosts the team calendar plus
// the personal vacation/shift tabs migrated from VacationPage.
//
// For now this is a thin wrapper around VacationPage so the route
// works end-to-end while the unified team calendar (appointments +
// leaves + shifts + holidays) is built incrementally in the
// `calendar/components` directory.

import VacationPage from '../../vacation/pages/VacationPage';

export default function CalendarPage() {
  return <VacationPage />;
}
