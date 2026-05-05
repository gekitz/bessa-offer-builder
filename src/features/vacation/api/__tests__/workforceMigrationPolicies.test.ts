import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260504120000_create_workforce.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('workforce migration RLS policies', () => {
  it('does not ship fully permissive workforce policies', () => {
    expect(migrationSql).not.toMatch(/CREATE POLICY\s+workforce_all/i);
    expect(migrationSql).not.toMatch(/FOR ALL\s+USING\s*\(\s*true\s*\)\s+WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it('ties workforce access to authenticated users and the matched employee profile', () => {
    expect(migrationSql).toMatch(/TO\s+authenticated/i);
    expect(migrationSql).toMatch(/auth\.uid\(\)/i);
    expect(migrationSql).toMatch(/current_employee_id\(\)/i);
    expect(migrationSql).toMatch(/is_workforce_approver\(\)/i);
  });
});
