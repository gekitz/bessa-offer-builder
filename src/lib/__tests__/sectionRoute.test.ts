import { describe, it, expect } from 'vitest';
import { sectionFromPath, pathForSection } from '../sectionRoute';

describe('sectionFromPath', () => {
  it('defaults to angebote on root path', () => {
    expect(sectionFromPath('/')).toBe('angebote');
    expect(sectionFromPath('')).toBe('angebote');
  });

  it('maps /kalender, /calendar, /leaves and /urlaub to kalender', () => {
    expect(sectionFromPath('/kalender')).toBe('kalender');
    expect(sectionFromPath('/calendar')).toBe('kalender');
    expect(sectionFromPath('/leaves')).toBe('kalender');
    expect(sectionFromPath('/urlaub')).toBe('kalender');
  });

  it('maps /tickets to tickets', () => {
    expect(sectionFromPath('/tickets')).toBe('tickets');
  });

  it('maps /crm to crm', () => {
    expect(sectionFromPath('/crm')).toBe('crm');
  });

  it('maps /angebote and /offers to angebote', () => {
    expect(sectionFromPath('/angebote')).toBe('angebote');
    expect(sectionFromPath('/offers')).toBe('angebote');
  });

  it('is case-insensitive', () => {
    expect(sectionFromPath('/LEAVES')).toBe('kalender');
    expect(sectionFromPath('/Crm')).toBe('crm');
    expect(sectionFromPath('/TICKETS')).toBe('tickets');
  });

  it('tolerates a trailing slash', () => {
    expect(sectionFromPath('/leaves/')).toBe('kalender');
    expect(sectionFromPath('/tickets/')).toBe('tickets');
  });

  it('matches the first path segment for nested routes', () => {
    expect(sectionFromPath('/angebote/builder')).toBe('angebote');
    expect(sectionFromPath('/leaves/employee/sbauer')).toBe('kalender');
    expect(sectionFromPath('/tickets/abc-123')).toBe('tickets');
  });

  it('falls back to angebote for unknown paths', () => {
    expect(sectionFromPath('/unknown')).toBe('angebote');
    expect(sectionFromPath('/foo/bar')).toBe('angebote');
  });
});

describe('pathForSection', () => {
  it('returns canonical paths', () => {
    expect(pathForSection('angebote')).toBe('/angebote');
    expect(pathForSection('crm')).toBe('/crm');
    expect(pathForSection('kalender')).toBe('/kalender');
    expect(pathForSection('tickets')).toBe('/tickets');
  });

  it('round-trips through sectionFromPath', () => {
    for (const s of ['angebote', 'crm', 'kalender', 'tickets'] as const) {
      expect(sectionFromPath(pathForSection(s))).toBe(s);
    }
  });
});
