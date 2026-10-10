import React from 'react';
import {
  ArrowRight,
  Baby,
  Bone,
  Brain,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  HeartPulse,
  Layers3,
  Mail,
  MapPin,
  Menu,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import {
  getPublicDoctorAvatar,
  localPublicDoctors,
  publicDepartments,
  publicHospital,
  publicServices,
} from '../data/publicSite';
import type { PublicDoctor } from '../data/publicSite';
import hospitalHeroImage from '../assets/images/hospital_hero_medical_1790929984585.jpg';

interface PublicWebsiteProps {
  onBookAppointment: () => void;
  onOpenLogin: () => void;
  showLocalDoctors?: boolean;
}

const departmentIcons = {
  heart: HeartPulse,
  baby: Baby,
  bone: Bone,
  women: UsersRound,
  brain: Brain,
  surgery: Syringe,
} as const;

const serviceIcons = {
  calendar: CalendarCheck,
  clipboard: ClipboardCheck,
  layers: Layers3,
} as const;

const navItems = [
  { label: 'About us', href: '#about' },
  { label: 'Departments', href: '#departments' },
  { label: 'Doctors', href: '#doctors' },
  { label: 'Patient care', href: '#patient-care' },
  { label: 'Contact', href: '#contact' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  onBookAppointment,
  onOpenLogin,
  showLocalDoctors = false,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [publicDoctors, setPublicDoctors] = React.useState<PublicDoctor[]>(localPublicDoctors);

  React.useEffect(() => {
    let active = true;
    const loadPublicDoctors = async () => {
      try {
        const response = await fetch('/api/hospital', { headers: { Accept: 'application/json' } });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) return;
        const payload: unknown = await response.json();
        if (!active || !isRecord(payload) || !Array.isArray(payload.doctors)) return;

        const doctors = payload.doctors.flatMap((value): PublicDoctor[] => {
          if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) return [];
          return [{
            id: typeof value.id === 'string' ? value.id : undefined,
            name: value.name,
            department: typeof value.department === 'string' ? value.department : undefined,
            specialty: typeof value.specialty === 'string' ? value.specialty : undefined,
            qualification: typeof value.qualification === 'string' ? value.qualification : undefined,
            gender: value.gender === 'Male' || value.gender === 'Female' || value.gender === 'Other'
              ? value.gender
              : undefined,
            avatar: getPublicDoctorAvatar(typeof value.gender === 'string' ? value.gender : undefined),
          }];
        });
        setPublicDoctors(doctors);
      } catch {
        // Local Vite development has no /api proxy; retain the safe local directory fallback.
      }
    };
    void loadPublicDoctors();
    const refreshInterval = window.setInterval(loadPublicDoctors, 30000);
    window.addEventListener('focus', loadPublicDoctors);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', loadPublicDoctors);
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fbfb] text-slate-900">
      <div className="bg-[#0d6b6e] px-4 py-2 text-center text-[11px] font-semibold tracking-wide text-white sm:text-xs">
        <span>Patient-first care, connected through PulseCare IHMS</span>
        <a className="ml-2 underline decoration-white/50 underline-offset-2 hover:text-teal-100" href={`tel:${publicHospital.phone.replace(/\s/g, '')}`}>
          Hospital reception {publicHospital.phone}
        </a>
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <a href="#top" className="flex items-center gap-3" onClick={closeMenu} aria-label="PulseCare home">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[17px] font-extrabold tracking-tight text-slate-950">PulseCare</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 sm:block">Integrated Hospital</span>
            </span>
          </a>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Public navigation">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-semibold text-slate-600 transition-colors hover:text-teal-700">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <button type="button" onClick={onOpenLogin} className="px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:text-teal-700">
              Patient portal
            </button>
            <button type="button" onClick={onBookAppointment} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2">
              Book appointment <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button type="button" className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 lg:hidden" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="mobile-public-nav" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}>
            {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>

        {menuOpen && (
          <nav id="mobile-public-nav" className="border-t border-slate-100 bg-white px-5 py-4 lg:hidden" aria-label="Mobile public navigation">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} onClick={closeMenu} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-800">
                  {item.label}
                </a>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => { closeMenu(); onOpenLogin(); }} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700">Patient portal</button>
                <button type="button" onClick={() => { closeMenu(); onBookAppointment(); }} className="rounded-xl bg-teal-700 px-3 py-3 text-sm font-bold text-white">Book appointment</button>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="relative overflow-hidden bg-[#eef8f7]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.04fr_0.96fr] lg:px-10 lg:py-24">
            <div className="relative z-10 max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-3.5 py-2 text-xs font-bold text-teal-800 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Care that stays connected
              </div>
              <h1 className="max-w-xl text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-[4.25rem]">
                A calmer way to take care of your health.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                PulseCare brings appointments, consultations, prescriptions and patient support into one thoughtful hospital experience.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={onBookAppointment} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-teal-900/10 transition-all hover:-translate-y-0.5 hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2">
                  Book an appointment <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <a href="#departments" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-extrabold text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50">
                  Explore departments <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-slate-600">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden="true" /> Secure patient portal</span>
                <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-teal-700" aria-hidden="true" /> {publicHospital.operationalHours}</span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-xl lg:max-w-none lg:justify-self-end">
              <div className="absolute -inset-6 rounded-[2.5rem] bg-teal-200/30 blur-2xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[2rem] border-8 border-white bg-slate-100 shadow-2xl shadow-slate-900/10">
                <img
                  src={hospitalHeroImage}
                  alt="Bright PulseCare hospital reception and clinical wing"
                  className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-[1.12] w-full object-cover"
                  fetchPriority="high"
                />
                <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-white/60 bg-white/90 p-4 shadow-lg backdrop-blur">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-800"><HeartPulse className="h-5 w-5" aria-hidden="true" /></span>
                    <div><p className="text-sm font-extrabold text-slate-900">Your care, in one place</p><p className="mt-0.5 text-xs text-slate-500">From first booking to follow-up</p></div>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-teal-700" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.83fr_1.17fr] lg:items-start">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-700">About PulseCare</p>
              <h2 className="mt-4 max-w-md text-3xl font-extrabold leading-tight tracking-[-0.03em] text-slate-950 sm:text-4xl">Designed around the patient experience.</h2>
            </div>
            <div className="grid gap-8 text-base leading-7 text-slate-600 sm:grid-cols-2">
              <p>PulseCare is the patient-facing experience for the Integrated Hospital Management System. It connects the practical moments of care—finding the right department, reserving a time, attending a consultation and keeping the next step visible.</p>
              <p>Behind the scenes, the existing hospital workspace coordinates role-based operations for patients, doctors, reception, staff, managers and administrators. The public website keeps that private workspace separate and easy to reach when needed.</p>
            </div>
          </div>
        </section>

        <section id="departments" className="scroll-mt-24 bg-[#f4f9f8] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-700">Find your care team</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-4xl">Departments for every step of care.</h2></div>
              <button type="button" onClick={onBookAppointment} className="inline-flex items-center gap-2 self-start text-sm font-extrabold text-teal-800 hover:text-teal-950 sm:self-auto">Book with a specialist <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicDepartments.map((department) => {
                const Icon = departmentIcons[department.icon];
                return <article key={department.name} className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-teal-200 hover:shadow-xl hover:shadow-teal-900/5"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-700 group-hover:text-white"><Icon className="h-6 w-6" aria-hidden="true" /></span><h3 className="mt-5 text-base font-extrabold text-slate-900">{department.name}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{department.description}</p><button type="button" onClick={onBookAppointment} className="mt-5 inline-flex items-center gap-1.5 text-xs font-extrabold text-teal-800">View appointment options <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button></article>;
              })}
            </div>
          </div>
        </section>

        <section id="doctors" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-700">Meet the specialists</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-4xl">Expertise, with a human touch.</h2><p className="mt-4 text-base leading-7 text-slate-600">Meet the specialists currently listed for PulseCare. Contact details remain private inside the secure hospital workspace.</p></div>
            {showLocalDoctors && publicDoctors.length > 0 ? <div className="mt-10 grid gap-5 md:grid-cols-2">{publicDoctors.map((doctor) => <article key={doctor.id || doctor.name} className="flex gap-5 rounded-2xl border border-slate-200 bg-[#f8fbfb] p-5"><img src={doctor.avatar} alt={doctor.name} className="h-24 w-24 shrink-0 rounded-2xl object-cover" loading="lazy" /><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-teal-700">{doctor.department || 'Hospital specialist'}</p><h3 className="mt-1 text-lg font-extrabold text-slate-950">{doctor.name}</h3><p className="mt-1 text-sm font-semibold text-slate-700">{doctor.specialty || 'Consultant doctor'}</p>{doctor.qualification && <p className="mt-2 text-xs leading-5 text-slate-500">{doctor.qualification}</p>}</div></article>)}</div> : <div className="mt-10 rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 p-7"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm"><Stethoscope className="h-5 w-5" aria-hidden="true" /></span><div><h3 className="font-extrabold text-slate-900">Specialist directory is available in the patient portal</h3><p className="mt-1 text-sm leading-6 text-slate-600">Sign in to see live doctor availability and appointment slots.</p><button type="button" onClick={onBookAppointment} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-teal-800">Continue to the portal <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div></div></div>}
          </div>
        </section>

        <section id="patient-care" className="scroll-mt-24 bg-[#f4f9f8] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-7xl"><div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-700">Patient care</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-4xl">Less friction between you and the next step.</h2><p className="mt-5 max-w-md text-base leading-7 text-slate-600">Everything here is built to help you arrive informed, book securely and keep your care history easy to find.</p></div><div className="grid gap-4 md:grid-cols-3">{publicServices.map((service) => { const Icon = serviceIcons[service.icon]; return <article key={service.title} className="rounded-2xl border border-slate-200 bg-white p-6"><Icon className="h-6 w-6 text-teal-700" aria-hidden="true" /><h3 className="mt-5 text-base font-extrabold text-slate-900">{service.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{service.description}</p></article>; })}</div></div></div>
        </section>

        <section className="bg-teal-800 px-5 py-16 text-white sm:px-8 lg:px-10 lg:py-20"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-200">Your next step</p><h2 className="mt-3 max-w-xl text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">Ready to plan your visit?</h2><p className="mt-3 max-w-xl text-sm leading-6 text-teal-50/80">Explore the hospital, choose a department, then sign in to continue through the existing patient booking workflow.</p></div><button type="button" onClick={onBookAppointment} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-extrabold text-teal-900 shadow-lg transition-colors hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-teal-800">Start booking <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div></section>

        <section id="contact" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-28"><div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-700">Contact us</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-4xl">We’re here to help you find the right next step.</h2><p className="mt-5 max-w-md text-base leading-7 text-slate-600">Connect with the PulseCare team for appointments, directions and general hospital information.</p></div><div className="grid gap-3 sm:grid-cols-2"><a href={`tel:${publicHospital.phone.replace(/\s/g, '')}`} className="rounded-2xl border border-slate-200 bg-[#f8fbfb] p-5 transition-colors hover:border-teal-300"><Phone className="h-5 w-5 text-teal-700" aria-hidden="true" /><p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Hospital phone</p><p className="mt-1 font-extrabold text-slate-900">{publicHospital.phone}</p></a><a href={`mailto:${publicHospital.email}`} className="rounded-2xl border border-slate-200 bg-[#f8fbfb] p-5 transition-colors hover:border-teal-300"><Mail className="h-5 w-5 text-teal-700" aria-hidden="true" /><p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Email</p><p className="mt-1 break-all text-sm font-extrabold text-slate-900">{publicHospital.email}</p></a><a href={publicHospital.mapUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-[#f8fbfb] p-5 transition-colors hover:border-teal-300"><MapPin className="h-5 w-5 text-teal-700" aria-hidden="true" /><p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Location</p><p className="mt-1 text-sm font-extrabold text-slate-900">{publicHospital.address}</p></a><div className="rounded-2xl border border-slate-200 bg-[#f8fbfb] p-5"><Clock3 className="h-5 w-5 text-teal-700" aria-hidden="true" /><p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Consultation hours</p><p className="mt-1 text-sm font-extrabold text-slate-900">{publicHospital.operationalHours}</p></div></div></div></section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-950 px-5 py-12 text-slate-300 sm:px-8 lg:px-10"><div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_0.9fr]"><div><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white"><Building2 className="h-5 w-5" aria-hidden="true" /></span><span className="text-lg font-extrabold text-white">PulseCare</span></div><p className="mt-5 max-w-sm text-sm leading-6 text-slate-400">Connected hospital care for appointments, consultations and follow-up support.</p></div><div><h2 className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Explore</h2><div className="mt-4 flex flex-col gap-3 text-sm font-semibold">{navItems.slice(0, 4).map((item) => <a key={item.href} href={item.href} className="hover:text-white">{item.label}</a>)}</div></div><div><h2 className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Contact</h2><button type="button" onClick={onBookAppointment} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-teal-300 hover:text-white">Book an appointment <ArrowRight className="h-4 w-4" aria-hidden="true" /></button><a href={`tel:${publicHospital.phone.replace(/\s/g, '')}`} className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white"><Phone className="h-4 w-4" aria-hidden="true" /> {publicHospital.phone}</a><a href={`mailto:${publicHospital.email}`} className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white"><Mail className="h-4 w-4" aria-hidden="true" /> {publicHospital.email}</a></div></div><div className="mx-auto mt-10 flex max-w-7xl flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 PulseCare Integrated Hospital</span><span>Patient care and hospital information</span></div></footer>
    </div>
  );
};
