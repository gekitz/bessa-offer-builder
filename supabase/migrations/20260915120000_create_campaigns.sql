-- ════════════════════════════════════════════════════════════════════
-- Outreach- & Replacement-Kampagnen — generische Engine
--
-- Zwei Tabellen bilden einen wiederverwendbaren Kampagnen-Motor:
--   • campaigns            — eine Zeile pro Sende-Effort (wiederholbar).
--                            `type` wählt den Handler (Type A = RKSV
--                            Signaturkarte, Type B = PoS-Ablöse, später).
--   • campaign_recipients  — eine Zeile pro Empfänger pro Kampagne:
--                            Funnel-Zeitstempel (sent → delivered →
--                            opened → clicked → landed → started →
--                            outcome) + typ-spezifischer Zustand in
--                            `payload` (jsonb).
--
-- Alles Typ-spezifische lebt in `payload` (RKSV-Wizard-Antworten,
-- Signatur, gewähltes Angebot …), damit ein neuer Kampagnentyp KEINE
-- pro-Zeile-Schemaänderung braucht. Neue Enum-Werte für `type` /
-- `subject_type` sind eine kleine CHECK-Migration; `outcome` trägt
-- BEWUSST keinen CHECK (der variabelste, typ-definierte Wert) und wird
-- in der API-Schicht (campaignApi.ts) validiert.
--
-- RLS ist permissiv wie der Rest der App (offers/viertl_licenses):
-- der anon-Client liest eine campaign_recipients-Zeile per Token direkt
-- von der öffentlichen Landing-Page (?c={token}) — genau wie AcceptPage
-- ein offer per share_code liest. Der Landing-Token ist die einzige
-- Obskurität, die eine Empfängerzeile schützt (gleiche Sicherheits-
-- haltung wie offers.share_code — ein geleakter select* legt Namen/
-- E-Mails offen; akzeptiert, konsistent mit dem Repo).
--
-- set_updated_at_now() existiert bereits (20260504120000_create_workforce)
-- — wird hier nur WIEDERVERWENDET, nicht neu definiert.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL
                  CHECK (type IN ('rksv_signature','pos_replacement')),
  key             TEXT NOT NULL UNIQUE,          -- z. B. '2026-acos'
  title           TEXT NOT NULL,
  email_subject   TEXT,
  email_template  TEXT,                          -- Inline-HTML-Body (pro Kampagne)
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','archived')),
  created_by_id   TEXT,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE campaign_recipients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject_type   TEXT NOT NULL
                 CHECK (subject_type IN ('viertl_license','mesonic_customer')),
  subject_id     TEXT NOT NULL,                  -- id/kdnr in der Quelle; Write-back
  name           TEXT,                           -- Snapshot beim Versand
  email          TEXT,                           -- Snapshot; NULL ⇒ kein E-Mail-/Druck-Segment
  batch          TEXT,                           -- Wellen-Label; Funnel je batch geschnitten
  resend_count   INT NOT NULL DEFAULT 0,         -- nur bei explizitem "Erneut senden" erhöht
  token          TEXT NOT NULL UNIQUE,           -- Landing-URL ?c={token}
  sent_at        TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  opened_at      TIMESTAMPTZ,
  clicked_at     TIMESTAMPTZ,
  landed_at      TIMESTAMPTZ,
  started_at     TIMESTAMPTZ,                    -- erste Wizard-Antwort ODER Outcome ohne Fragen
  outcome        TEXT,                           -- typ-definiert; in der API validiert (kein CHECK)
  outcome_at     TIMESTAMPTZ,
  bounced_at     TIMESTAMPTZ,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- typ-spezifische Antworten/Zustand
  ticket_id      UUID REFERENCES tickets(id) ON DELETE SET NULL,
  offer_id       UUID REFERENCES offers(id)  ON DELETE SET NULL,
  resend_id      TEXT,                           -- Webhook-Zuordnung (Resend email id)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
-- Idempotenz-Garantie: "in dieser Kampagne für dieses Subjekt bereits kontaktiert".
-- Eine bewusste Folge-Welle erhöht resend_count auf der BESTEHENDEN Zeile
-- statt eine neue einzufügen, sodass diese Bedingung hält (Phase 4).
CREATE UNIQUE INDEX uq_campaign_recipients_subject
  ON campaign_recipients(campaign_id, subject_type, subject_id);
-- Webhook-Zuordnung keyt auf resend_id (Phase 3).
CREATE INDEX idx_campaign_recipients_resend ON campaign_recipients(resend_id)
  WHERE resend_id IS NOT NULL;
CREATE INDEX idx_campaign_recipients_batch ON campaign_recipients(campaign_id, batch);
CREATE INDEX idx_campaign_recipients_outcome ON campaign_recipients(campaign_id, outcome);

CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
CREATE TRIGGER trg_campaign_recipients_updated_at BEFORE UPDATE ON campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on campaigns" ON campaigns
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on campaign_recipients" ON campaign_recipients
  FOR ALL USING (true) WITH CHECK (true);
