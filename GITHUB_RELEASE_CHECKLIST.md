# GitHub and release checklist — PulseCare IHMS

This repository package is prepared for Git version control. A GitHub push is not proof of deployment readiness: complete the verification below before connecting a production database or publishing a public clinical service.

## Before the first push

- [ ] Review `README.md`, `PROJECT_CONTEXT.md`, and `docs/DEEP_AUDIT_2026-10-18.md`.
- [ ] Keep `package-lock.json` tracked so `npm ci` uses the reviewed dependency graph.
- [ ] Do not commit `.env`, `.env.local`, `.vercel/`, service-role keys, SMTP passwords, live patient data, or production exports. `.gitignore` excludes environment files except `.env.example`.
- [ ] Confirm `.env.example` contains placeholders only. `VITE_` values are bundled into the public client; never put secrets in them.
- [ ] Configure accurate approved hospital/practitioner identity, helpline, emergency, privacy, and patient-facing information before any public/clinical use. Prescription/API responses no longer invent registration or contact values.
- [ ] Check for existing duplicate appointment/revenue keys using the read-only SQL preflight queries in `docs/SQL_EXECUTION_ORDER.md` before applying uniqueness changes to existing data.

## Verify locally (Node.js 22.12+)

```bash
npm ci
npm run lint
npx tsc -p api/tsconfig.json
npm run check:smoke
npm run build
```

Do not merge or deploy if any command fails. The audit environment used for this package could not complete dependency downloads, so the full typechecks and production build are still outstanding; they must pass on a network-enabled machine or CI runner.

## Initialize and push to GitHub

From the extracted project root, create an empty repository on GitHub first. Then replace the URL below with your repository URL:

```bash
git init
git add .
git status --short
git diff --cached --stat
# Review staged files and confirm no local .env or patient data is staged.
git commit -m "Prepare PulseCare IHMS for staged release"
git branch -M main
git remote add origin https://github.com/<OWNER>/<REPOSITORY>.git
git push -u origin main
```

If this folder already has a Git remote, inspect `git remote -v` and update it instead of adding a duplicate remote. Never force-push over an existing repository history without reviewing it.

## Staging verification required before production

- [ ] Apply the focused Supabase migrations in documented order to a backed-up staging database, or follow the documented full-schema path for a clean database.
- [ ] Verify migrations and index creation without data loss; inspect/reschedule future appointment starts in the 13:00–14:00 lunch interval before enabling the changed rules.
- [ ] Verify `pg_cron` schedule existence and successful automatic attendance checkout runs.
- [ ] Run positive and negative RLS tests with separate patient, doctor, receptionist, manager and admin accounts.
- [ ] Race-test appointment creation against doctor shift updates; verify the same-slot unique rule and conflict response.
- [ ] Verify realtime updates/reconnection across independent browser sessions, including logout/account-switch permission removal.
- [ ] Test email delivery with a safe mailbox. For `unknown` status, verify provider logs before manual reconciliation; do not blindly resend.
- [ ] End-to-end test appointment booking, registration/login, patient history/prescriptions, receptionist queue and payments, manager staff/leave flows, attendance checkout, and admin revenue totals.
- [ ] Review Vercel environment values, Supabase auth URL allowlists, SMTP provider configuration, privacy-safe logging, HTTPS, and deployment preview smoke tests.
- [ ] Capture deployed page performance/Core Web Vitals and confirm no release-blocking errors.

## Current audit verdict

**INCONCLUSIVE — not yet certified ready for production deployment.** The configured source-level smoke suite passes. TypeScript syntax parsing and relative-import checks pass. The audit environment could not install all dependencies, so the full frontend/API typechecks and Vite production build did not complete; no live Supabase, RLS, realtime, SMTP, Vercel, browser end-to-end, or production performance tests were run. See `docs/DEEP_AUDIT_2026-10-18.md` for findings and evidence.
