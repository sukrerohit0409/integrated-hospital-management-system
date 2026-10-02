# PulseCare IHMS — Integrated Hospital Management System

A comprehensive, role-based hospital management web application built with **React 19**, **TypeScript**, **Tailwind CSS 4**, and **Vite 8**.

## Features

- **Multi-Role Dashboards** — Admin, Manager, Doctor, Receptionist, Staff (Nurse/Ward Boy/Cleaner), and Patient portals
- **Appointment Management** — Online booking, walk-in registration, queue management, and slot checker
- **Digital Prescriptions** — Doctors write prescriptions with print-ready modal
- **Fee Collection & Billing** — Cash / Card / UPI payment tracking with real-time revenue reports
- **Staff Attendance** — Clock in/out, working hours & days tracking
- **Leave Management** — Staff apply for leave, Managers approve/reject
- **Revenue & Expense Analytics** — Date-filtered financial dashboards for Admin
- **Responsive Design** — Works on mobile, tablet, and desktop

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript 7 |
| Styling | Tailwind CSS 4 |
| Build Tool | Vite 8 |
| Icons | Lucide React |
| Animation | Motion (Framer Motion) |
| Data Store | Browser localStorage; optional shared Supabase database for the Vercel demo |

## Getting Started

### Prerequisites

- **Node.js** v20.19+ or v22.12+
- **npm** v9 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/ihms-project.git
cd ihms-project

# Install dependencies
npm install --legacy-peer-deps

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**

### Production Build

```bash
npm run build
npm run start
```

### Share demo data across browsers with Supabase

By default, each browser stores its own data in `localStorage`. To share users, appointments, attendance, billing, expenses, and leave data between browsers:

1. Create a Supabase project.
2. In its **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql).
3. In **Project Settings → API**, copy the project URL and the `service_role` key.
4. In Vercel **Project → Settings → Environment Variables**, add:
   - `VITE_SHARED_DEMO_DATA` = `true` (Production, Preview, and Development)
   - `SUPABASE_URL` = your Supabase project URL (server-side)
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase `service_role` key (server-side only; never add a `VITE_` prefix)
5. Redeploy the project.

The demo API polls for shared changes every four seconds. The initial mock records are copied into Supabase the first time the shared store is initialized. The API is intentionally public for this demo, so anyone with the deployed URL can view and modify its demo records. Do not use it for real patient data.

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | rohit@gmail.com | rohit@gmail.com |
| Manager | manager@gmail.com | manager@gmail.com |
| Doctor | doctor@gmail.com | doctor@gmail.com |
| Receptionist | reception@gmail.com | reception@gmail.com |
| Nurse | priya@gmail.com | priya@gmail.com |
| Patient | rahul@gmail.com | rahul@gmail.com |

## Project Structure

```
├── api/                  # Serverless API routes (health check, hospital info)
├── src/
│   ├── assets/images/    # Doctor avatars and hero images
│   ├── components/
│   │   ├── admin/        # Admin dashboard (revenue, expense, staff, attendance)
│   │   ├── doctor/       # Doctor dashboard (consultations, prescriptions)
│   │   ├── manager/      # Manager dashboard (staff oversight, leave approvals)
│   │   ├── patient/      # Patient dashboard (booking, history, follow-ups)
│   │   ├── receptionist/ # Receptionist dashboard (queue, fee collection, walk-in)
│   │   ├── staff/        # Staff dashboard (attendance, leave applications)
│   │   ├── Navbar.tsx
│   │   ├── LoginModal.tsx
│   │   ├── ChangePasswordModal.tsx
│   │   └── PrintPrescriptionModal.tsx
│   ├── data/
│   │   ├── mockData.ts   # Initial seed data
│   │   └── store.ts      # In-memory data store with localStorage
│   └── types/
│       └── index.ts      # TypeScript type definitions
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## License

This project is for educational and demonstration purposes.
