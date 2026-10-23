/**
 * Vercel Serverless Function compatible API router for IHMS operations
 */
export default async function handler(req: any, res: any) {
  const method = req.method || 'GET';

  if (method === 'GET') {
    const data = {
      hospitalName: 'PulseCare Integrated Hospital',
      ...(process.env.HOSPITAL_EMERGENCY_CONTACT?.trim()
        ? { emergencyContact: process.env.HOSPITAL_EMERGENCY_CONTACT.trim() }
        : {}),
      departments: [
        'Cardiology & Internal Medicine',
        'Pediatrics & Neonatology',
        'Orthopedics & Joint Care',
        'Gynecology & Obstetrics',
        'Neurology',
        'General Surgery'
      ],
      operationalHours: '24/7 Emergency Service; OPD Appointments 09:00 AM - 10:00 PM; Lunch Break 01:00 PM - 02:00 PM',
      appointmentSlotMinutes: 15,
      slotIntervalMinutes: 15
    };

    if (res && typeof res.status === 'function') {
      return res.status(200).json(data);
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (res && typeof res.status === 'function') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
