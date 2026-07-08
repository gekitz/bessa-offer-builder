import { describe, expect, it } from 'vitest';
import {
  formatTripNote,
  normalizeTrip,
  resolveVehicle,
  toViennaIso,
  tripDate,
  tripsForDate,
} from './webfleetTrips';
import type { TripSuggestion, VehicleAssignment } from '../types';

function assignment(over: Partial<VehicleAssignment>): VehicleAssignment {
  return {
    id: 'a1',
    employeeId: 'emp-1',
    webfleetObjectNo: '001',
    plate: 'K-1234 AB',
    label: 'Renault Kangoo lang',
    validFrom: '2026-01-01',
    validTo: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function trip(over: Partial<TripSuggestion>): TripSuggestion {
  return {
    tripId: 't1',
    objectno: '001',
    objectName: 'Renault Kangoo lang',
    driverName: null,
    startTime: '2026-07-08T08:00:00',
    endTime: '2026-07-08T08:30:00',
    km: 10,
    durationMinutes: 30,
    startAddress: null,
    endAddress: null,
    ...over,
  };
}

describe('resolveVehicle', () => {
  const standing = assignment({ id: 'std', webfleetObjectNo: '001' });

  it('returns the standing (open-ended) assignment', () => {
    expect(resolveVehicle([standing], 'emp-1', '2026-07-08')?.webfleetObjectNo).toBe('001');
  });

  it('returns null for a different employee', () => {
    expect(resolveVehicle([standing], 'emp-2', '2026-07-08')).toBeNull();
  });

  it('returns null before the assignment starts', () => {
    expect(resolveVehicle([standing], 'emp-1', '2025-12-31')).toBeNull();
  });

  it('respects a closed validTo range', () => {
    const closed = assignment({ validFrom: '2026-01-01', validTo: '2026-06-30' });
    expect(resolveVehicle([closed], 'emp-1', '2026-06-30')?.webfleetObjectNo).toBe('001');
    expect(resolveVehicle([closed], 'emp-1', '2026-07-01')).toBeNull();
  });

  it('a day-swap row (later validFrom) wins over the standing one', () => {
    const swap = assignment({
      id: 'swap',
      webfleetObjectNo: '099',
      validFrom: '2026-07-08',
      validTo: '2026-07-08',
    });
    expect(resolveVehicle([standing, swap], 'emp-1', '2026-07-08')?.webfleetObjectNo).toBe('099');
    // ...and the day after, it's back to the standing car.
    expect(resolveVehicle([standing, swap], 'emp-1', '2026-07-09')?.webfleetObjectNo).toBe('001');
  });
});

describe('normalizeTrip', () => {
  // Shape captured verbatim from a live showTripReportExtern response.
  const raw = {
    tripid: '14858860163',
    objectno: '001',
    objectname: 'Renault Kangoo lang',
    drivername: 'RussnigH',
    start_time: '2026-07-08T06:10:15Z', // UTC
    end_time: '2026-07-08T06:49:29Z',
    duration: 2354, // seconds
    distance: 50174, // metres
    start_postext: 'TEXMEX KLAGENFURT, Rosentaler Straße 4, 9020 Klagenfurt am Wörthersee, AT',
    end_postext: 'MOCHORITSCH GASTRONOMIE GMBH, Gewerbestraße 11, 9112 Griffen, AT',
  };

  it('converts metres to km with 2 decimals', () => {
    expect(normalizeTrip(raw)?.km).toBe(50.17);
  });

  it('uses the explicit duration field (seconds → minutes)', () => {
    expect(normalizeTrip(raw)?.durationMinutes).toBe(39);
  });

  it('converts UTC timestamps to Europe/Vienna local (CEST = +2h)', () => {
    expect(normalizeTrip(raw)?.startTime).toBe('2026-07-08T08:10:15');
    expect(normalizeTrip(raw)?.endTime).toBe('2026-07-08T08:49:29');
  });

  it('carries tripId, objectName and driverName through', () => {
    const t = normalizeTrip(raw);
    expect(t?.tripId).toBe('14858860163');
    expect(t?.objectName).toBe('Renault Kangoo lang');
    expect(t?.driverName).toBe('RussnigH');
  });

  it('takes postext as the full address line', () => {
    const t = normalizeTrip(raw);
    expect(t?.startAddress).toBe('TEXMEX KLAGENFURT, Rosentaler Straße 4, 9020 Klagenfurt am Wörthersee, AT');
    expect(t?.endAddress).toBe('MOCHORITSCH GASTRONOMIE GMBH, Gewerbestraße 11, 9112 Griffen, AT');
  });

  it('falls back to timestamp diff when no duration field is present', () => {
    const { duration, ...noDur } = raw;
    const t = normalizeTrip({ ...noDur, start_time: '2026-07-08T08:00:00Z', end_time: '2026-07-08T08:30:00Z' });
    expect(t?.durationMinutes).toBe(30);
  });

  it('falls back to the tripdistance alias', () => {
    const { distance, ...noDist } = raw;
    expect(normalizeTrip({ ...noDist, tripdistance: 5000 })?.km).toBe(5);
  });

  it('returns null when start/end time is missing', () => {
    expect(normalizeTrip({ ...raw, start_time: undefined })).toBeNull();
  });

  it('defaults km to 0 when no distance field is present', () => {
    const { distance, ...noDist } = raw;
    expect(normalizeTrip(noDist)?.km).toBe(0);
  });
});

describe('toViennaIso', () => {
  it('applies summer offset (+2h) in July', () => {
    expect(toViennaIso('2026-07-08T06:10:15Z')).toBe('2026-07-08T08:10:15');
  });

  it('applies winter offset (+1h) in January', () => {
    expect(toViennaIso('2026-01-15T06:10:15Z')).toBe('2026-01-15T07:10:15');
  });

  it('rolls the date when UTC late evening is next-day local', () => {
    // 22:30Z in summer = 00:30 next day in Vienna.
    expect(toViennaIso('2026-07-08T22:30:00Z')).toBe('2026-07-09T00:30:00');
  });
});

describe('tripsForDate', () => {
  const trips = [
    trip({ startTime: '2026-07-08T08:00:00' }),
    trip({ startTime: '2026-07-08T14:00:00' }),
    trip({ startTime: '2026-07-09T09:00:00' }),
  ];

  it('keeps only trips on the given local date, newest first', () => {
    const r = tripsForDate(trips, '2026-07-08');
    expect(r).toHaveLength(2);
    expect(r[0].startTime).toContain('14:00'); // newest first
    expect(r[1].startTime).toContain('08:00');
  });

  it('tripDate reads the local date part verbatim', () => {
    expect(tripDate('2026-07-08T23:59:00')).toBe('2026-07-08');
  });
});

describe('formatTripNote', () => {
  it('renders a German-formatted origin note', () => {
    const note = formatTripNote(
      trip({
        objectName: 'Renault Kangoo lang',
        startTime: '2026-07-08T08:10:15',
        endTime: '2026-07-08T08:49:29',
        km: 50.17,
        endAddress: 'MOCHORITSCH GASTRONOMIE GMBH, Gewerbestraße 11, 9112 Griffen, AT',
      }),
    );
    expect(note).toBe(
      'Webfleet: 08:10–08:49 · 50,17 km · Renault Kangoo lang → MOCHORITSCH GASTRONOMIE GMBH, Gewerbestraße 11, 9112 Griffen, AT',
    );
  });

  it('falls back to objectno when no name/end address', () => {
    const note = formatTripNote(
      trip({ objectno: '001', objectName: null, km: 5, endAddress: null, startTime: '2026-07-08T09:12:00', endTime: '2026-07-08T09:22:00' }),
    );
    expect(note).toBe('Webfleet: 09:12–09:22 · 5,00 km · 001');
  });
});
