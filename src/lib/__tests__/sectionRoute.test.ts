import { describe, it, expect } from 'vitest';
import { sectionFromPath, pathForSection } from '../sectionRoute';

describe('sectionFromPath', () => {
  it('defaults to angebote on root path', () => {
    expect(sectionFromPath('/')).toBe('angebote');
    expect(sectionFromPath('')).toBe('angebote');
  });

  it('maps /leaves and /urlaub to urlaub', () => {
    expect(sectionFromPath('/leaves')).toBe('urlaub');
    expect(sectionFromPath('/urlaub')).toBe('urlaub');
  });

  it('maps /crm to crm', () => {
    expect(sectionFromPath('/crm')).toBe('crm');
  });

  it('maps /angebote and /offers to angebote', () => {
    expect(sectionFromPath('/angebote')).toBe('angebote');
    expect(sectionFromPath('/offers')).toBe('angebote');
  });

  it('is case-insensitive', () => {
    expect(sectionFromPath('/LEAVES')).toBe('urlaub');
    expect(sectionFromPath('/Crm')).toBe('crm');
  });

  it('tolerates a trailing slash', () => {
    expect(sectionFromPath('/leaves/')).toBe('urlaub');
  });

  it('matches the first path segment for nested routes', () => {
    expect(sectionFromPath('/angebote/builder')).toBe('angebote');
    expect(sectionFromPath('/leaves/employee/sbauer')).toBe('urlaub');
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
    expect(pathForSection('urlaub')).toBe('/leaves');
  });

  it('round-trips through sectionFromPath', () => {
    for (const s of ['angebote', 'crm', 'urlaub'] as const) {
      expect(sectionFromPath(pathForSection(s))).toBe(s);
    }
  });
});
