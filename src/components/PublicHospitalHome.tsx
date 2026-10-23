import React from 'react';
import { ArrowRight, CalendarCheck, Clock3, HeartPulse, ShieldCheck, Stethoscope, UsersRound } from 'lucide-react';
import heroImage from '../assets/images/hospital_hero_medical.webp';

const departments = [
  { name: 'Cardiology & Internal Medicine', description: 'Heart health, internal medicine consultations, and ongoing care.', icon: HeartPulse },
  { name: 'Pediatrics & Neonatology', description: 'Thoughtful medical care for infants, children, and adolescents.', icon: UsersRound },
  { name: 'General OPD', description: 'First-line consultations, symptoms assessment, and care coordination.', icon: Stethoscope },
  { name: 'Emergency & Critical Care', description: 'Hospital emergency services and coordinated critical-care support.', icon: Clock3 },
];

export const PublicHospitalHome: React.FC<{ onBookAppointment: () => void }> = ({ onBookAppointment }) => (
  <div className="space-y-8 sm:space-y-10">
    <section className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[1.05fr_.95fr]">
      <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
        <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          <ShieldCheck className="h-4 w-4" /> Coordinated care. Clear information.
        </span>
        <h1 className="max-w-xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">Healthcare that puts your care journey first.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">Explore hospital services, connect with our departments, and manage appointments through one secure patient portal.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={onBookAppointment} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2">
            Book an Appointment <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-7 grid max-w-lg grid-cols-3 gap-3 border-t border-slate-100 pt-5">
          <div><p className="text-lg font-bold text-slate-900">Care</p><p className="text-[11px] text-slate-500">Hospital services</p></div>
          <div><p className="text-lg font-bold text-slate-900">One</p><p className="text-[11px] text-slate-500">Connected portal</p></div>
          <div><p className="text-lg font-bold text-slate-900">Secure</p><p className="text-[11px] text-slate-500">Role-based access</p></div>
        </div>
      </div>
      <div className="relative min-h-[260px] bg-slate-100 lg:min-h-[480px]">
        <img src={heroImage} alt="Modern hospital care environment" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />
        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/30 bg-white/90 p-4 shadow-lg backdrop-blur-sm sm:bottom-7 sm:left-7 sm:right-7">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">PulseCare Hospital</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">A connected experience from appointment to follow-up</p>
        </div>
      </div>
    </section>

    <section aria-labelledby="departments-heading">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">Our services</p><h2 id="departments-heading" className="mt-1 text-2xl font-bold text-slate-950">Departments & care teams</h2></div>
        <p className="max-w-lg text-sm text-slate-600">Find the right place to start. The care team can help coordinate your next step.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {departments.map(({ name, description, icon: Icon }) => (
          <article key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><Icon className="h-5 w-5" /></div>
            <h3 className="mt-4 text-sm font-bold text-slate-900">{name}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">{description}</p>
            <button onClick={onBookAppointment} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-950">Explore appointments <ArrowRight className="h-3.5 w-3.5" /></button>
          </article>
        ))}
      </div>
    </section>

    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-100/80 p-5 sm:grid-cols-3 sm:p-6">
      <div className="flex gap-3"><CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-800" /><div><h3 className="text-sm font-bold text-slate-900">Appointments</h3><p className="mt-1 text-xs leading-5 text-slate-600">Choose a doctor and an available appointment time.</p></div></div>
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-800" /><div><h3 className="text-sm font-bold text-slate-900">Private access</h3><p className="mt-1 text-xs leading-5 text-slate-600">Patient, clinician, and administration workspaces are separated by role.</p></div></div>
      <div className="flex gap-3"><Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-teal-800" /><div><h3 className="text-sm font-bold text-slate-900">Follow-up care</h3><p className="mt-1 text-xs leading-5 text-slate-600">Review appointment history and follow-up recommendations in the portal.</p></div></div>
    </section>
  </div>
);
