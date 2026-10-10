# PulseCare IHMS — Integrated Hospital Management System

A comprehensive, role-based hospital management web application built with **React 19**, **TypeScript**, **Tailwind CSS 4**, and **Vite 8**.

## Features

- **Public Landing Page & Hospital Directory** — Modern public website with hospital overview, departments, doctor directory, emergency helpline (+91 82619 98094), and online appointment booking.
- **Multi-Role Dashboards** — Dedicated portals for Admin, Manager, Doctor, Receptionist, Staff (Nurse, Pharmacist, Lab Technician, Other), and Patients.
- **Appointment Management & Slot Checker** — Standardized consultation window (09:00 AM – 10:00 PM IST, 30-minute slots, midday break 12:30 PM – 02:00 PM), dynamic slot generator, walk-in registration, token numbering, and queue management.
- **Appointment Confirmation Emails** — Automated, idempotent email delivery via Nodemailer (supporting ports 465 SSL and 587 STARTTLS) with custom HTML email templates and delivery ledger.
- **Doctor Consultation & Digital Prescriptions** — Doctors manage queues, record clinical diagnoses and consultation notes, and generate line-item prescriptions with print-ready modal.
- **Fee Collection & Billing** — Cash / Card / UPI payment tracking with automatic revenue ledger updates and reception receipt generation.
- **Medical Test & Consultation Charges** — Doctors add itemized consultation and test charges; receptionists review, collect, and settle fees.
- **Staff Attendance & Working Hours** — Clock in/out tracking using official hospital IST time with automatic decimal hours and working days computation.
- **Leave Management** — Staff apply for leave with date ranges and categories; Managers and Admins review, approve, or reject.
- **Revenue & Expense Analytics** — Date-filtered financial dashboards, payment method breakdowns, and net income calculations for Admin.
- **Data Integrity & Deletion Guards** — Prevents deletion of doctors with active or upcoming appointments in both local demo store and Supabase backend.
- **Multi-Session Tab Isolation** — Isolated per-tab sessions (`tabSessionId` + `sessionStorage`) allowing multiple roles to run simultaneously in different tabs of the same browser without session crosstalk.
- **Responsive Design** — Fully responsive interface across mobile, tablet, and desktop viewports.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite`) |
| Build Tool | Vite 8 |
| Icons | Lucide React |
| Animation | Motion (Framer Motion) |
| Transactional Email | Nodemailer (Serverless API, Ports 465 & 587) |
| Authentication | Supabase Auth (or Local Demo Mode) |
| User Profiles & Data | Supabase PostgreSQL with Row Level Security & Realtime |
| Database Functions | PostgreSQL Stored Procedures / RPCs (`save_ihms_consultation`, `claim_ihms_appointment_confirmation`) |

## Getting Started

### Prerequisites

- **Node.js** v20.19+ or v22.12+ (Vite 8 requirement)
- **npm** v9 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/pulsecare-ihms.git
cd pulsecare-ihms

# Install dependencies
npm ci

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**

### Verification and Quality Checks

```bash
# Run automated test suite (hospital date, invariants, and rate limiting)
npm test

# Frontend TypeScript check
npm run lint

# Serverless API TypeScript check
npx tsc -p api/tsconfig.json

# Production bundle build
npm run build
```

### Production Preview

```bash
npm run start
# Runs 'vite preview --port=3000 --host=0.0.0.0'
```

The repository-root GitHub Actions workflow runs `npm ci`, frontend and API TypeScript checks, and the production build for every push and pull request.

## Local Demo Mode

Without Supabase environment variables, development mode uses browser-local demo data.
- **Session Isolation:** Authentication is isolated per browser tab using `sessionStorage` and a unique `tabSessionId`. Opening multiple tabs allows testing different roles simultaneously (e.g. Doctor in Tab 1, Patient in Tab 2, Receptionist in Tab 3).
- **Cross-Tab Synchronization:** Record changes (bookings, attendance, billing) trigger custom broadcast events (`ihms:data-success`, `ihms:data-error`) so open tabs reflect updates.
- **Demo Credentials:** In demo mode, sign in using any demo account email with either the user's password or the master demo password `local-demo-only-not-for-deployment`.
- **Safe Environment:** The app does not import browser demo records into Supabase. Demo credentials must never be reused for production deployment.

## Supabase Authentication & Backend Setup

### Create and Configure the Database

1. Create a Supabase project and save its database password securely. Select the region closest to the hospital.
2. In **Project Settings → API**, copy the Project URL and the publishable/anon key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never expose the service-role key in frontend code.
3. Open **SQL Editor → New query**, paste the complete contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates:
   - `profiles` table with role check constraint.
   - `ihms_records` table with Row Level Security.
   - `ihms_email_notifications` ledger.
   - Transactional RPCs: `save_ihms_consultation` and `claim_ihms_appointment_confirmation`.
4. In **Table Editor**, verify that `profiles`, `ihms_records`, and `ihms_email_notifications` exist and have Row Level Security enabled.
5. In **Authentication → URL Configuration**, set the Site URL to your production URL and add redirect URLs (e.g. `http://localhost:3000/**`, `https://<your-project>.vercel.app/**`).
6. In **Authentication → Providers → Email**, enable **Confirm email**.

### Connect the Application and Bootstrap First Admin

7. Copy `.env.example` to `.env.local` and configure your credentials:
   ```env
   VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
   SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
   ```
8. For local API development (including `/api/staff` and `/api/appointment-confirmation`), run:
   ```bash
   npx vercel dev
   ```
9. Register the first account through the patient registration form, confirm the verification email, and promote it to `admin` in the Supabase SQL Editor:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = 'AUTH_USER_UUID'
     and role = 'patient';
   ```
10. Admins and Managers can subsequently create staff accounts directly from their dashboards.

## Deploy to Vercel

### Patient Appointment Confirmation Email Configuration

When a patient books an appointment, the serverless endpoint [`api/appointment-confirmation.ts`](./api/appointment-confirmation.ts) sends an authenticated, idempotent confirmation email.

Configure these server-only environment variables in Vercel (**Project → Settings → Environment Variables**):

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465` (or `587` with STARTTLS)
- `SMTP_USER=your_gmail_address@gmail.com`
- `SMTP_PASS=your_google_app_password`
- `SMTP_FROM_NAME=PulseCare Integrated Hospital`
- `SMTP_FROM_EMAIL=your_gmail_address@gmail.com`

> **Note:** Never prefix server-only credentials (`SUPABASE_SERVICE_ROLE_KEY`, `SMTP_*`) with `VITE_`.

## Project Structure

```
├── api/                                # Vercel serverless functions
│   ├── appointment-confirmation.ts     # Transactional confirmation emails (Nodemailer)
│   ├── health.ts                       # Health check endpoint
│   ├── hospital.ts                     # Public hospital info & doctor directory API
│   ├── staff.ts                        # Administrative staff account provisioning & removal
│   └── tsconfig.json                   # TypeScript config for serverless functions
├── scripts/                            # Verification & invariant test scripts
│   ├── check-hospital-date.mjs         # Timezone & date calculation tests
│   └── test-ihms-invariants.mjs        # Slot bounds, conflict checks & deletion guards
├── supabase/
│   └── schema.sql                      # Complete PostgreSQL schema, RLS policies & RPCs
├── src/
│   ├── assets/images/                  # Bundled hospital hero and doctor avatar images
│   ├── components/
│   │   ├── admin/                      # Admin dashboard (finances, staff, attendance)
│   │   ├── doctor/                     # Doctor dashboard (queue, consultations, Rx)
│   │   ├── manager/                    # Manager dashboard (operations, HR, leave approvals)
│   │   ├── patient/                    # Patient dashboard (booking, medical history)
│   │   ├── receptionist/               # Receptionist dashboard (queue, walk-ins, billing)
│   │   ├── staff/                      # Staff portal (attendance, leaves)
│   │   ├── AttendanceMarker.tsx        # Clock in/out component with decimal hours math
│   │   ├── ChangePasswordModal.tsx     # Password update dialog
│   │   ├── LoginModal.tsx              # Role & credentials login dialog
│   │   ├── Navbar.tsx                  # App header, role badge, quick-switch & logout
│   │   ├── PrintPrescriptionModal.tsx  # Formatted, printable prescription slip
│   │   └── PublicWebsite.tsx           # Public hospital landing page & booking portal
│   ├── data/
│   │   ├── appointmentEmails.ts        # Client email trigger service
│   │   ├── appointmentSchedule.ts      # 09:00 - 22:00 IST consultation slots & break filter
│   │   ├── auth.ts                     # Supabase authentication helper layer
│   │   ├── mockData.ts                 # Initial demo seed dataset & imported avatars
│   │   ├── publicSite.ts               # Landing page content and hospital amenities
│   │   ├── staffAccounts.ts            # Client interface to /api/staff management
│   │   ├── store.ts                    # Synchronized data store (sessionStorage / Supabase)
│   │   └── tabSession.ts               # Per-tab session isolation manager
│   ├── utils/
│   │   ├── hospitalDate.ts             # Asia/Kolkata timezone & calendar calculations
│   │   └── userDisplay.ts              # Display name and role badge formatters
│   ├── types/
│   │   └── index.ts                    # TypeScript definitions for hospital data
│   ├── App.tsx                         # Root router & layout component
│   ├── index.css                       # Tailwind CSS stylesheet
│   └── main.tsx                        # Application entry point
├── index.html                          # HTML template
├── package.json                        # Scripts & dependencies
├── tsconfig.json                       # Client TypeScript configuration
├── vercel.json                         # Vercel deployment configuration
└── vite.config.ts                      # Vite build configuration
```

## License

This project is for educational and demonstration purposes.
