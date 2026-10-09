import { describe, it, expect } from 'vitest';
import { buildCustomerSearchKey, buildArticleSearchKey } from './mesonicApi';

describe('buildCustomerSearchKey', () => {
  it('matches a single word with a wildcard LIKE on the combined name field', () => {
    expect(buildCustomerSearchKey('Grünwald')).toBe(
      "where T055.C003 LIKE '%%Grünwald%%'"
    );
  });

  it('is word-order independent — ANDs one LIKE per word', () => {
    const forward = buildCustomerSearchKey('Klaus Grünwald');
    const reversed = buildCustomerSearchKey('Grünwald Klaus');
    expect(forward).toBe(
      "where T055.C003 LIKE '%%Klaus%%' AND T055.C003 LIKE '%%Grünwald%%'"
    );
    // Same set of clauses regardless of order the user types them.
    expect(reversed).toBe(
      "where T055.C003 LIKE '%%Grünwald%%' AND T055.C003 LIKE '%%Klaus%%'"
    );
  });

  it('collapses extra whitespace between and around words', () => {
    expect(buildCustomerSearchKey('  Klaus   Grünwald  ')).toBe(
      "where T055.C003 LIKE '%%Klaus%%' AND T055.C003 LIKE '%%Grünwald%%'"
    );
  });

  it('escapes single quotes in a word', () => {
    expect(buildCustomerSearchKey("O'Brien")).toBe(
      "where T055.C003 LIKE '%%O''Brien%%'"
    );
  });

  it('caps the number of AND terms to keep the URL short', () => {
    const key = buildCustomerSearchKey('a b c d e f g');
    expect(key.match(/LIKE/g)).toHaveLength(5);
  });
});

describe('buildArticleSearchKey', () => {
  it('matches a single word with a wildcard LIKE on the description field', () => {
    expect(buildArticleSearchKey('Bondrucker')).toBe(
      "where T024.C003 LIKE '%%Bondrucker%%'"
    );
  });

  it('is word-order independent — ANDs one LIKE per word', () => {
    const forward = buildArticleSearchKey('Epson Bondrucker');
    const reversed = buildArticleSearchKey('Bondrucker Epson');
    expect(forward).toBe(
      "where T024.C003 LIKE '%%Epson%%' AND T024.C003 LIKE '%%Bondrucker%%'"
    );
    // Same set of clauses regardless of order the user types them.
    expect(reversed).toBe(
      "where T024.C003 LIKE '%%Bondrucker%%' AND T024.C003 LIKE '%%Epson%%'"
    );
  });

  it('collapses extra whitespace between and around words', () => {
    expect(buildArticleSearchKey('  Epson   Bondrucker  ')).toBe(
      "where T024.C003 LIKE '%%Epson%%' AND T024.C003 LIKE '%%Bondrucker%%'"
    );
  });

  it('escapes single quotes in a word', () => {
    expect(buildArticleSearchKey("O'Neil")).toBe(
      "where T024.C003 LIKE '%%O''Neil%%'"
    );
  });

  it('caps the number of AND terms to keep the URL short', () => {
    const key = buildArticleSearchKey('a b c d e f g');
    expect(key.match(/LIKE/g)).toHaveLength(5);
  });
});
