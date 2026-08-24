// KITZ delivery locations for Jarltech orders. The purchaser picks one
// per order (goods go to Klagenfurt or Wolfsberg). Mirrors the addresses
// in COMPANY_DEFAULT (catalogs.ts), structured for Jarltech's
// shipping_address (country_code / company_name / street / zip / city).

export interface ShippingAddress {
  countryCode: string; // ISO 3166-1 alpha-2, uppercase
  companyName: string;
  street: string;
  zip?: string;
  city?: string;
  contactName?: string;
  phone?: string;
}

export type StandortKey = 'klagenfurt' | 'wolfsberg';

export const KITZ_STANDORTE: Record<StandortKey, { label: string; address: ShippingAddress }> = {
  klagenfurt: {
    label: 'Klagenfurt',
    address: {
      countryCode: 'AT',
      companyName: 'KITZ Computer + Office GmbH',
      street: 'Rosentaler Straße 1',
      zip: '9020',
      city: 'Klagenfurt',
      phone: '+43 (0) 463 504454',
    },
  },
  wolfsberg: {
    label: 'Wolfsberg',
    address: {
      countryCode: 'AT',
      companyName: 'KITZ Computer + Office GmbH',
      street: 'Johann-Offner-Straße 17',
      zip: '9400',
      city: 'Wolfsberg',
      phone: '+43 (0) 4352 4176',
    },
  },
};
