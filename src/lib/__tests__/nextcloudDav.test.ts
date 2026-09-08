import { describe, it, expect } from 'vitest';
import {
  matchesCustomerFolder,
  hrefToRelPath,
  parsePropfind,
  buildFolderUrl,
  findCustomerFolders,
} from '../nextcloudDav';

const DAV_PREFIX = '/remote.php/dav/files/svc';

// A realistic Nextcloud 207 Multistatus for PROPFIND Depth:1 on /Kunden.
// First <response> is the base folder itself; the rest are children. Names use
// the real convention "<Name> - <Kundennummer>". Mixes namespace prefix casing
// and includes a non-folder (a stray file) to prove the collection filter.
const MULTISTATUS = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/svc/Kunden/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Kunden</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/svc/Kunden/Zum%20Alois%20-%20233679/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Zum Alois - 233679</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/svc/Kunden/WME%20Gastronomie%20GmbH%20-%20Euco%20Restaurant%20-%20238243/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>WME Gastronomie GmbH - Euco Restaurant - 238243</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/svc/Kunden/Uni-Pizzeria%20-%20234637/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Uni-Pizzeria - 234637</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/svc/Kunden/README.txt</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>README.txt</d:displayname>
        <d:resourcetype/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

describe('matchesCustomerFolder', () => {
  it('matches the number as a suffix', () => {
    expect(matchesCustomerFolder('Zum Alois - 233679', '233679')).toBe(true);
    expect(matchesCustomerFolder('Uni Cafe - 273530', '273530')).toBe(true);
  });

  it('matches names with extra " - " segments before the number', () => {
    expect(matchesCustomerFolder('WME Gastronomie GmbH - Euco Restaurant - 238243', '238243')).toBe(true);
  });

  it('does not match the number as a prefix of a longer number', () => {
    // classic false positive: 12345 must NOT match "...- 123456"
    expect(matchesCustomerFolder('Foo - 123456', '12345')).toBe(false);
  });

  it('does not match the number embedded mid-name', () => {
    expect(matchesCustomerFolder('233679 - Zum Alois', '233679')).toBe(false);
  });

  it('tolerates trailing whitespace', () => {
    expect(matchesCustomerFolder('Uni Cafe - 273530   ', '273530')).toBe(true);
  });

  it('rejects empty / non-matching input', () => {
    expect(matchesCustomerFolder('Zum Alois - 233679', '')).toBe(false);
    expect(matchesCustomerFolder('Zum Alois - 233679', '999999')).toBe(false);
  });
});

describe('hrefToRelPath', () => {
  it('strips the dav files prefix and decodes', () => {
    expect(
      hrefToRelPath('/remote.php/dav/files/svc/Kunden/Zum%20Alois%20-%20233679/', DAV_PREFIX),
    ).toBe('/Kunden/Zum Alois - 233679');
  });

  it('handles Nextcloud installed under a subdirectory', () => {
    expect(
      hrefToRelPath('/nextcloud/remote.php/dav/files/svc/Kunden/Uni%20Cafe%20-%20273530/', DAV_PREFIX),
    ).toBe('/Kunden/Uni Cafe - 273530');
  });
});

describe('buildFolderUrl', () => {
  it('builds an open-in-Nextcloud deep link', () => {
    expect(buildFolderUrl('https://cloud.kitz.at', '/Kunden/Zum Alois - 233679')).toBe(
      'https://cloud.kitz.at/apps/files/?dir=%2FKunden%2FZum%20Alois%20-%20233679',
    );
  });

  it('normalises a trailing slash on the base url', () => {
    expect(buildFolderUrl('https://cloud.kitz.at/', '/Kunden/X - 1')).toContain(
      'https://cloud.kitz.at/apps/files/?dir=',
    );
  });
});

describe('parsePropfind', () => {
  it('extracts every response entry with name, collection flag and relPath', () => {
    const folders = parsePropfind(MULTISTATUS, DAV_PREFIX);
    expect(folders).toHaveLength(5);
    const readme = folders.find((f) => f.name === 'README.txt');
    expect(readme?.isCollection).toBe(false);
    const alois = folders.find((f) => f.name === 'Zum Alois - 233679');
    expect(alois?.isCollection).toBe(true);
    expect(alois?.relPath).toBe('/Kunden/Zum Alois - 233679');
  });
});

describe('findCustomerFolders', () => {
  const opts = {
    davUserPrefix: DAV_PREFIX,
    baseUrl: 'https://cloud.kitz.at',
    basePath: '/Kunden',
  };

  it('returns the single matching folder with a deep link', () => {
    const res = findCustomerFolders(MULTISTATUS, { ...opts, customerNumber: '233679' });
    expect(res).toEqual([
      {
        name: 'Zum Alois - 233679',
        relPath: '/Kunden/Zum Alois - 233679',
        url: 'https://cloud.kitz.at/apps/files/?dir=%2FKunden%2FZum%20Alois%20-%20233679',
      },
    ]);
  });

  it('matches folders with extra dash segments before the number', () => {
    const res = findCustomerFolders(MULTISTATUS, { ...opts, customerNumber: '238243' });
    expect(res.map((r) => r.name)).toEqual(['WME Gastronomie GmbH - Euco Restaurant - 238243']);
  });

  it('excludes the queried base folder itself', () => {
    // Even if a base folder were named to look like a match, its relPath ===
    // basePath filters it out. Here just assert the base "Kunden" never leaks.
    const res = findCustomerFolders(MULTISTATUS, { ...opts, customerNumber: '234637' });
    expect(res.every((r) => r.relPath !== '/Kunden')).toBe(true);
    expect(res).toHaveLength(1);
  });

  it('ignores non-folder entries', () => {
    // README.txt can never match a number suffix, but assert nothing file-like slips through.
    const res = findCustomerFolders(MULTISTATUS, { ...opts, customerNumber: '999999' });
    expect(res).toHaveLength(0);
  });
});
