import maleDoctorAvatar from '../assets/images/doctor_avatar_male_1790929999766.jpg';
import femaleDoctorAvatar from '../assets/images/doctor_avatar_female_1790930016857.jpg';

export type PublicDoctor = {
  id?: string;
  name: string;
  specialty?: string;
  qualification?: string;
  department?: string;
  gender?: 'Male' | 'Female' | 'Other';
  avatar: string;
};

export function getPublicDoctorAvatar(gender?: string): string {
  return gender === 'Male' ? maleDoctorAvatar : femaleDoctorAvatar;
}

export const publicHospital = {
  name: 'PulseCare Integrated Hospital',
  shortName: 'PulseCare',
  phone: '+91 82619 98094',
  email: 'hospital.management.system.demo@gmail.com',
  address: 'Deccan, Pune, Maharashtra, India',
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=Deccan%2C%20Pune%2C%20Maharashtra%2C%20India',
  operationalHours: 'Doctor consultations · 09:00 AM – 10:00 PM IST',
};

export const publicDepartments = [
  { name: 'Cardiology & Internal Medicine', description: 'Focused outpatient consultations for heart health and general medicine.', icon: 'heart' },
  { name: 'Pediatrics & Neonatology', description: 'Specialist care for children and newborns through the patient portal.', icon: 'baby' },
  { name: 'Orthopedics & Joint Care', description: 'Consultation support for mobility, bones and joint concerns.', icon: 'bone' },
  { name: 'Gynecology & Obstetrics', description: 'Dedicated women’s health consultations and appointment support.', icon: 'women' },
  { name: 'Neurology', description: 'Appointments for neurological evaluation and follow-up care.', icon: 'brain' },
  { name: 'General Surgery', description: 'Outpatient surgical consultations coordinated through reception.', icon: 'surgery' },
] as const;

export const publicServices = [
  { title: 'Online appointment booking', description: 'Choose a specialist, view available time slots and reserve your visit through the secure patient portal.', icon: 'calendar' },
  { title: 'Digital consultation records', description: 'Keep appointment history and doctor-issued prescriptions together in one patient workspace.', icon: 'clipboard' },
  { title: 'Coordinated hospital care', description: 'Appointments, consultations, billing and follow-up workflows are connected inside PulseCare IHMS.', icon: 'layers' },
] as const;

// Public-safe doctor fields supplied from the hospital directory. Private email
// addresses and phone numbers are intentionally not included on the welcome page.
export const localPublicDoctors: PublicDoctor[] = [
  {
    name: 'Dr. Rohan Sharma',
    specialty: 'Interventional Cardiology',
    qualification: 'MBBS, MD, DM (Cardiology)',
    department: 'Cardiology',
    avatar: maleDoctorAvatar,
  },
  {
    name: 'Dr. Ananya Iyer',
    specialty: 'Consultant Pediatrician & Neonatologist',
    qualification: 'MBBS, DNB (Pediatrics), MNAMS',
    department: 'Pediatrics',
    avatar: femaleDoctorAvatar,
  },
] as const;
