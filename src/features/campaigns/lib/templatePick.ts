import type { Campaign } from '../types';

// Reusable CONTENT copied when a new campaign is seeded from an existing one as
// a template ("Vorlage übernehmen"). Deliberately only the content fields —
// public heading, e-mail subject, HTML body — never the identity (key/title/id/
// status/type), which must always be set fresh for the new campaign.
export interface TemplateContent {
  publicTitle: string;
  emailSubject: string;
  emailTemplate: string;
}

export function pickTemplateFields(c: Campaign): TemplateContent {
  return {
    publicTitle: c.publicTitle ?? '',
    emailSubject: c.emailSubject ?? '',
    emailTemplate: c.emailTemplate ?? '',
  };
}
