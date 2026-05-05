#!/usr/bin/env bash
# Phase B: TypeScript + Vitest toolchain on feature/workforce.
# Run from repo root:
#   bash scripts/setup_workforce_branch.sh
#
# Steps:
#   1. Ensure we're on feature/workforce
#   2. Clean up obsolete files (vite.config.js, vite timestamp artifacts, old Urlaubsplaner drafts)
#   3. Move the canonical workforce concept doc into docs/workforce/
#   4. Install new dev dependencies (TypeScript, Vitest, Testing Library, etc.)
#   5. Run the smoke test to verify the toolchain works
#   6. Run the production build to verify nothing's broken
#   7. Commit & push to origin/feature/workforce
#
# DOES push by default. Pass --no-push to skip.

set -euo pipefail
PUSH=true
for arg in "$@"; do
  if [ "$arg" = "--no-push" ]; then PUSH=false; fi
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
echo "==> Working in $REPO_ROOT"

# Stale lock removal (in case something crashed earlier)
[ -f .git/index.lock ] && rm -f .git/index.lock || true

# 1. Branch sanity
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "feature/workforce" ]; then
  echo "ERROR: expected to be on 'feature/workforce', currently on '$BRANCH'." >&2
  echo "Switch first:  git switch feature/workforce" >&2
  exit 1
fi

# 2. Clean obsolete files
echo
echo "==> Removing obsolete config files and draft docs"
rm -f vite.config.js
rm -f vite.config.js.timestamp-*.mjs
# Old Urlaubsplaner drafts at the root - we keep only v4 (and move it)
rm -f Urlaubsplaner_Konzept.docx
rm -f Urlaubsplaner_Konzept_v2.docx
rm -f Urlaubsplaner_Konzept_v3.docx

# 3. Move v4 into docs/workforce/
mkdir -p docs/workforce
if [ -f Urlaubsplaner_Konzept_v4.docx ]; then
  mv Urlaubsplaner_Konzept_v4.docx docs/workforce/Urlaubsplaner_Konzept_v4.docx
  echo "==> Moved Urlaubsplaner_Konzept_v4.docx -> docs/workforce/"
fi

# 4. Install dependencies
echo
echo "==> Installing dev dependencies (yarn install)"
yarn install

# 5. Smoke test
echo
echo "==> Running smoke tests"
yarn test:run

# 6. Production build sanity check
echo
echo "==> Verifying production build still works"
yarn build

# 7. Commit & push
echo
echo "==> Staging changes"
# .gitignore line "Urlaubsplaner_Konzept*.docx" matches anywhere — force-add the canonical doc
git add -A
git add -f docs/workforce/Urlaubsplaner_Konzept_v4.docx 2>/dev/null || true

echo "==> Status before commit:"
git status --short

git -c user.name="Georg Kitz" -c user.email="georg.kitz@bessa.app" commit -m "chore(toolchain): TypeScript + Vitest for workforce branch

Sets up the development infrastructure that the App.jsx refactor
and the upcoming workforce/vacation-planner module will rely on.

Toolchain:
- TypeScript 5.7 with allowJs (incremental migration from JSX)
- tsconfig.json (src) and tsconfig.node.json (vite config)
- vite.config.js -> vite.config.ts; embeds Vitest config
- src/vite-env.d.ts: declares __GIT_HASH__, __BUILD_TIME__, env vars

Testing:
- Vitest 2 with jsdom environment
- @testing-library/react + jest-dom matchers
- vitest.setup.ts: cleans DOM between tests
- src/__tests__/smoke.test.ts: verifies the runner works

Scripts:
- yarn test          watch mode
- yarn test:run      single run (CI-friendly)
- yarn test:coverage v8 coverage report
- yarn typecheck     tsc --noEmit

Cleanup:
- Removed obsolete vite.config.js and timestamp artifacts
- Moved Urlaubsplaner_Konzept_v4.docx into docs/workforce/
- Dropped old draft versions (v1-v3)"

echo
echo "==> Latest commit:"
git log --oneline -3

if [ "$PUSH" = "true" ]; then
  echo
  echo "==> Pushing branch to origin"
  git push -u origin feature/workforce
else
  echo
  echo "==> Skipping push (--no-push). Push manually with:"
  echo "    git push -u origin feature/workforce"
fi

echo
echo "==> Done. The toolchain is set up and the smoke test passed."
