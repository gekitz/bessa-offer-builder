#!/usr/bin/env bash
# One-shot script to commit the pending main-branch changes in three logical commits.
# Run this once from the repo root (the script does its own cd):
#   bash scripts/commit_main_changes.sh
# Does NOT push - review the commits with `git log --oneline -5` and push manually:
#   git push origin main

set -euo pipefail

# Resolve repo root from script location so it works regardless of cwd
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Working in $REPO_ROOT"

# 1. Remove any stale lock left behind by previous attempts
if [ -f .git/index.lock ]; then
  echo "==> Removing stale .git/index.lock"
  rm -f .git/index.lock
fi

# Sanity: must be on main and must be a clean-ish state aside from expected changes
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "ERROR: expected to be on 'main', currently on '$BRANCH'." >&2
  echo "Switch to main first:  git switch main" >&2
  exit 1
fi

echo "==> Current status:"
git status --short

# ---------------------------------------------------------------
# Commit 1: gitignore
# ---------------------------------------------------------------
echo
echo "==> [1/3] Committing .gitignore updates"
git add .gitignore
git commit -m "chore(gitignore): ignore env files, build artifacts, and local agent state

- .env / .env.local / .env.*.local
- .stripe and .yarn/ artifacts
- vite.config.js.timestamp-*.mjs
- .claude/ (Cowork agent local state)
- Local working drafts (Urlaubsplaner_Konzept*.docx)"

# ---------------------------------------------------------------
# Commit 2: Mesonic API documentation
# ---------------------------------------------------------------
echo
echo "==> [2/3] Committing Mesonic API documentation"
git add docs/Mesonic_API_Abfrage.md \
        docs/Mesonic_API_Abfrage.docx \
        docs/PDF_TO_MESONIC_ANALYSIS.md
git commit -m "docs(mesonic): add Mesonic WinLine API analysis and PDF-to-Mesonic mapping

- Mesonic_API_Abfrage.md/.docx: API query reference
- PDF_TO_MESONIC_ANALYSIS.md: mapping notes for offer-to-Mesonic flow"

# ---------------------------------------------------------------
# Commit 3: Online acceptance + Stripe billing feature
# ---------------------------------------------------------------
echo
echo "==> [3/3] Committing online acceptance + Stripe billing feature"
git add package.json yarn.lock \
        src/lib/qr.js \
        src/main.jsx \
        src/lib/offerApi.js \
        src/pdf/OfferPdfDocument.jsx \
        src/components/AppShell.jsx \
        src/App.jsx \
        supabase/functions/send-offer/index.ts \
        supabase/functions/stripe-create-checkout/ \
        supabase/functions/stripe-webhook/ \
        supabase/functions/stripe-complete-acceptance/ \
        supabase/migrations/20260423120000_add_stripe_billing.sql
git commit -m "feat(billing): online offer acceptance with QR code and Stripe checkout

Customer-facing acceptance flow accessible via shared URL or QR code:

- src/main.jsx: route ?a=<share_code> bypasses login and renders AcceptPage
- src/App.jsx: AcceptPage with plan cards (open-ended subscription vs fixed term),
  plus billing toggle wiring and Leistungsbeginn (service-start date) input
- src/lib/qr.js: QR code generation for the accept URL
- src/pdf/OfferPdfDocument.jsx: embed QR code + Leistungsbeginn in the PDF
- src/components/AppShell.jsx: Stripe-Billing toggle in sidebar (admin-only)
- src/lib/offerApi.js: serviceStartDate persistence + includeAcceptLink option
- supabase/functions/send-offer: include accept link in customer e-mail
- supabase/functions/stripe-create-checkout: create Stripe checkout session
- supabase/functions/stripe-webhook: handle Stripe webhook events
- supabase/functions/stripe-complete-acceptance: finalize after payment
- migrations/20260423120000_add_stripe_billing.sql: Stripe billing schema"

# ---------------------------------------------------------------
# Done
# ---------------------------------------------------------------
echo
echo "==> Done. Latest commits:"
git log --oneline -5

echo
echo "==> Remaining status (should be clean):"
git status --short

echo
echo "Next step: review and push"
echo "  git log --stat -3"
echo "  git push origin main"
