import { describe, it, expect } from 'vitest';
import {
  matchesKundennummer,
  buildConnectUrl,
  normalizeSnapshot,
  findCustomerDevices,
  TV_CONNECT_SCHEME,
} from '../teamviewerMatch';

describe('matchesKundennummer', () => {
  it('matches the number as a suffix on a group name', () => {
    expect(matchesKundennummer('Gomernik & Pichler - 21273', '21273')).toBe(true);
    expect(matchesKundennummer('Zum Alois - 233679', '233679')).toBe(true);
  });

  it('matches the number as a suffix on a device alias', () => {
    expect(matchesKundennummer('Aichholzer KFZ - 233679', '233679')).toBe(true);
  });

  it('does not match a number that is a prefix of a longer number', () => {
    expect(matchesKundennummer('Foo - 123456', '12345')).toBe(false);
  });

  it('does not match untagged aliases (number-only, no fuzzy)', () => {
    expect(matchesKundennummer('Aichholzer KFZ', '233679')).toBe(false);
    expect(matchesKundennummer('Pansi TomTailor St.Veit', '233679')).toBe(false);
  });

  it('does not match the number mid-string', () => {
    expect(matchesKundennummer('233679 - Zum Alois', '233679')).toBe(false);
  });

  it('tolerates trailing whitespace and empty input', () => {
    expect(matchesKundennummer('Zum Alois - 233679  ', '233679')).toBe(true);
    expect(matchesKundennummer('Zum Alois - 233679', '')).toBe(false);
    expect(matchesKundennummer('', '233679')).toBe(false);
  });
});

describe('buildConnectUrl', () => {
  it('builds a teamviewer:// deep link from the remotecontrol id', () => {
    expect(buildConnectUrl('r936809945')).toBe('teamviewer://control?device=r936809945');
    expect(buildConnectUrl('r936809945')).toBe(`${TV_CONNECT_SCHEME}r936809945`);
  });
});

// Shapes mirror the real API payloads.
const GROUPS = {
  groups: [
    { id: 'g71673181', name: 'ETRON' }, // product group — customers live on the device alias
    { id: 'g119760321', name: 'Zum Alois - 233679' }, // customer group — customer on the group
  ],
};

const DEVICES = {
  devices: [
    // ETRON product group: one tagged device (customer), the rest untagged.
    { remotecontrol_id: 'r1006881172', alias: 'Aichholzer KFZ - 233679', groupid: 'g71673181', online_state: 'Offline' },
    { remotecontrol_id: 'r936809945', alias: 'Pansi TomTailor St.Veit', groupid: 'g71673181', online_state: 'Offline' },
    { remotecontrol_id: 'r994764076', alias: 'Cimenti KG', groupid: 'g71673181', online_state: 'Online' },
    // Customer group: alias is generic, the number is on the GROUP name.
    { remotecontrol_id: 'r191693668', alias: 'Kassa 1', groupid: 'g119760321', online_state: 'Online' },
    { remotecontrol_id: 'r191693669', alias: 'Büro PC', groupid: 'g119760321', online_state: 'Offline' },
  ],
};

describe('normalizeSnapshot', () => {
  it('flattens devices and resolves the group name onto each', () => {
    const snap = normalizeSnapshot(GROUPS, DEVICES);
    expect(snap).toHaveLength(5);
    const aich = snap.find((d) => d.alias === 'Aichholzer KFZ - 233679');
    expect(aich?.groupName).toBe('ETRON');
    expect(aich?.online).toBe(false);
    const cimenti = snap.find((d) => d.alias === 'Cimenti KG');
    expect(cimenti?.online).toBe(true);
  });

  it('tolerates missing / null payloads', () => {
    expect(normalizeSnapshot(null, null)).toEqual([]);
    expect(normalizeSnapshot({}, { devices: [{ alias: 'x' }] })).toEqual([]); // no remotecontrol_id → dropped
  });
});

describe('findCustomerDevices', () => {
  const snap = normalizeSnapshot(GROUPS, DEVICES);

  it('matches a device tagged on its alias inside a product group', () => {
    const res = findCustomerDevices(snap, '233679');
    // Aichholzer (alias-tagged) AND the two Zum-Alois devices (group-tagged) all
    // carry 233679 in this fixture.
    expect(res.map((d) => d.alias).sort()).toEqual(['Aichholzer KFZ - 233679', 'Büro PC', 'Kassa 1']);
  });

  it('lists online devices first', () => {
    const res = findCustomerDevices(snap, '233679');
    expect(res[0].online).toBe(true); // Kassa 1 is online
    expect(res.some((d) => !d.online)).toBe(true);
  });

  it('attaches a ready connect link', () => {
    const res = findCustomerDevices(snap, '233679');
    const kassa = res.find((d) => d.alias === 'Kassa 1');
    expect(kassa?.url).toBe('teamviewer://control?device=r191693668');
  });

  it('returns nothing for an untagged customer (no fuzzy fallback)', () => {
    // "Cimenti KG" exists but is untagged → not returned for its (unknown) number.
    expect(findCustomerDevices(snap, '999999')).toEqual([]);
  });

  it('returns nothing for an empty number', () => {
    expect(findCustomerDevices(snap, '')).toEqual([]);
  });
});
