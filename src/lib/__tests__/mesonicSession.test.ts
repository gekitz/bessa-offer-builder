import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROBE_KONTO,
  isSessionError,
  needsLivenessProbe,
  parseEximXml,
  PROBE_VERIFY_TTL_MS,
} from '../../../supabase/functions/mesonic-proxy/session';

// These pure helpers drive the mesonic-proxy's stale-session self-healing.
// The edge function wires them to fetch/login; here we pin the decision logic.

describe('isSessionError', () => {
  it('detects the explicit WinLine session error codes', () => {
    expect(isSessionError('...001001...')).toBe(true);
    expect(isSessionError('...001002...')).toBe(true);
    expect(isSessionError('Session was not found')).toBe(true);
    expect(isSessionError('No WebService Session available')).toBe(true);
  });

  it('does not flag a healthy or empty-but-valid response', () => {
    expect(isSessionError('<MESOWebService Template="X"><X><A>1</A></X></MESOWebService>')).toBe(false);
    // 000161 "Kein Datensatz" is a no-match, NOT a session error — this is the
    // ambiguous case the liveness probe exists to disambiguate.
    expect(isSessionError('<ErrorCode>000161</ErrorCode>')).toBe(false);
  });
});

describe('parseEximXml', () => {
  it('parses multiple records from the MESOWebService envelope', () => {
    const xml =
      '<MESOWebService TemplateType="1" Template="WebArtikelExport">' +
      '<WebArtikelExport><T024_C001>16030051</T024_C001><T024_C003>Kassa</T024_C003></WebArtikelExport>' +
      '<WebArtikelExport><T024_C001>16030052</T024_C001><T024_C003>Bon</T024_C003></WebArtikelExport>' +
      '</MESOWebService>';
    const parsed = parseEximXml(xml);
    expect(parsed.error).toBeUndefined();
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0].T024_C001).toBe('16030051');
    expect(parsed.records[1].T024_C003).toBe('Bon');
  });

  it('surfaces the 000161 no-record error with zero records', () => {
    const xml =
      '<MESOWebServiceResult><OverallSuccess>false</OverallSuccess>' +
      '<ResultDetails><ErrorCode>000161</ErrorCode>' +
      '<ErrorText>Kein Datensatz für den Export vorhanden</ErrorText></ResultDetails>' +
      '</MESOWebServiceResult>';
    const parsed = parseEximXml(xml);
    expect(parsed.errorCode).toBe('000161');
    expect(parsed.records).toHaveLength(0);
  });

  it('treats a bare 6-digit body as an error code', () => {
    const parsed = parseEximXml('000161');
    expect(parsed.errorCode).toBe('000161');
    expect(parsed.records).toHaveLength(0);
  });

  it('returns zero records for an empty envelope (the ambiguous stale case)', () => {
    const parsed = parseEximXml('<MESOWebService Template="WebArtikelExport"></MESOWebService>');
    expect(parsed.records).toHaveLength(0);
  });
});

describe('needsLivenessProbe', () => {
  const now = 1_000_000;

  it('never probes when the query returned records (proof of life)', () => {
    expect(needsLivenessProbe(3, 0, now, PROBE_VERIFY_TTL_MS)).toBe(false);
  });

  it('probes on an empty result when liveness was not verified recently', () => {
    const stale = now - PROBE_VERIFY_TTL_MS - 1;
    expect(needsLivenessProbe(0, stale, now, PROBE_VERIFY_TTL_MS)).toBe(true);
  });

  it('skips the probe on an empty result if verified within the TTL', () => {
    const recent = now - Math.floor(PROBE_VERIFY_TTL_MS / 2);
    expect(needsLivenessProbe(0, recent, now, PROBE_VERIFY_TTL_MS)).toBe(false);
  });

  it('probes right at the TTL boundary once it is exceeded', () => {
    expect(needsLivenessProbe(0, now - PROBE_VERIFY_TTL_MS, now, PROBE_VERIFY_TTL_MS)).toBe(false);
    expect(needsLivenessProbe(0, now - PROBE_VERIFY_TTL_MS - 1, now, PROBE_VERIFY_TTL_MS)).toBe(true);
  });
});

describe('sentinel config', () => {
  it('defaults the liveness probe to the HAUSINTERN account', () => {
    expect(DEFAULT_PROBE_KONTO).toBe('24998');
  });
});
