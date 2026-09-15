import { describe, it, expect } from 'vitest';

import { filterLicensesForSegment, licenseToEnrollSubject } from '../rksvEnroll';
import type { ViertlLicense } from '../../../viertl/types';

function lic(over: Partial<ViertlLicense> = {}): ViertlLicense {
  return {
    id: 'l1',
    mesonicKdnr: '12345',
    name: 'Haus am Wald',
    contact: null,
    street: null,
    plz: '4020',
    ort: 'Linz',
    email: 'a@b.at',
    emailCheckedAt: null,
    gastrotouchVersion: '67.25',
    lastUpdate: null,
    hardwareModel: null,
    hardwareNeeded: false,
    wartung: 'none',
    status: 'new',
    customerStatus: 'active',
    closedReason: null,
    closedAt: null,
    notes: null,
    linkedOfferId: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('licenseToEnrollSubject — snapshot semantics (M1 crux)', () => {
  it('snapshots knownHardwareNeeded from the boolean column', () => {
    expect(licenseToEnrollSubject(lic({ hardwareNeeded: true }), 'w1').payload.knownHardwareNeeded).toBe(true);
    expect(licenseToEnrollSubject(lic({ hardwareNeeded: false }), 'w1').payload.knownHardwareNeeded).toBe(false);
  });

  it('versionOk=true for version >= 67.25 (same parse as the wizard)', () => {
    expect(licenseToEnrollSubject(lic({ gastrotouchVersion: '67.25' }), 'w1').payload.versionOk).toBe(true);
    expect(licenseToEnrollSubject(lic({ gastrotouchVersion: '68.00' }), 'w1').payload.versionOk).toBe(true);
  });

  it('versionOk=false for a parseable version < 67.25', () => {
    expect(licenseToEnrollSubject(lic({ gastrotouchVersion: '67.24' }), 'w1').payload.versionOk).toBe(false);
  });

  it('versionOk is ABSENT (undefined, not false) for null/junk version', () => {
    const nullVer = licenseToEnrollSubject(lic({ gastrotouchVersion: null }), 'w1');
    expect(nullVer.payload.versionOk).toBeUndefined();
    expect('versionOk' in nullVer.payload).toBe(false); // key not stamped (C1)

    const junk = licenseToEnrollSubject(lic({ gastrotouchVersion: 'kaputt' }), 'w1');
    expect(junk.payload.versionOk).toBeUndefined();
    expect('versionOk' in junk.payload).toBe(false);
  });

  it('passes through id (write-back key), name, email and batch', () => {
    const s = licenseToEnrollSubject(lic({ id: 'lic-uuid', name: 'X', email: null }), 'welle-2026');
    expect(s.subjectType).toBe('viertl_license');
    expect(s.subjectId).toBe('lic-uuid');
    expect(s.name).toBe('X');
    expect(s.email).toBeNull();
    expect(s.batch).toBe('welle-2026');
  });
});

describe('filterLicensesForSegment', () => {
  const licenses = [
    lic({ id: '1', name: 'Alpha', customerStatus: 'active', hardwareNeeded: true, email: 'a@x.at', ort: 'Wien' }),
    lic({ id: '2', name: 'Beta', customerStatus: 'closed', hardwareNeeded: false, email: null, ort: 'Graz' }),
    lic({ id: '3', name: 'Gamma', customerStatus: 'active', hardwareNeeded: false, email: null, ort: 'Linz', contact: 'Frau Müller' }),
  ];

  it('empty filter returns all', () => {
    expect(filterLicensesForSegment(licenses, {})).toHaveLength(3);
  });

  it('customerStatus filters (drops non-matching)', () => {
    const active = filterLicensesForSegment(licenses, { customerStatus: 'active' });
    expect(active.map((l) => l.id)).toEqual(['1', '3']);
  });

  it('hardwareNeeded-only keeps only licenses needing hardware', () => {
    const hw = filterLicensesForSegment(licenses, { hardwareNeeded: true });
    expect(hw.map((l) => l.id)).toEqual(['1']);
  });

  it('withEmailOnly excludes null-email licenses; default keeps them (print segment, C3)', () => {
    expect(filterLicensesForSegment(licenses, { withEmailOnly: true }).map((l) => l.id)).toEqual(['1']);
    // default (false / absent) keeps no-email licenses
    expect(filterLicensesForSegment(licenses, {}).map((l) => l.id)).toEqual(['1', '2', '3']);
  });

  it('search matches over name / ort / kdnr / contact (ViertlPage haystack)', () => {
    expect(filterLicensesForSegment(licenses, { search: 'gamma' }).map((l) => l.id)).toEqual(['3']);
    expect(filterLicensesForSegment(licenses, { search: 'graz' }).map((l) => l.id)).toEqual(['2']);
    expect(filterLicensesForSegment(licenses, { search: 'müller' }).map((l) => l.id)).toEqual(['3']);
    expect(filterLicensesForSegment(licenses, { search: '12345' })).toHaveLength(3); // shared kdnr
  });

  it('combines predicates (active + with-email)', () => {
    expect(
      filterLicensesForSegment(licenses, { customerStatus: 'active', withEmailOnly: true }).map((l) => l.id),
    ).toEqual(['1']);
  });
});
