/**
 * Vercel Serverless Function compatible API router for IHMS operations
 */
export default async function handler(req: any, res: any) {
  const method = req.method || 'GET';
  
  if (method === 'GET') {
    const data = {
      hospitalName: 'PulseCare Integrated Hospital',
      emergencyContact: '+91-1122334455',
      departments: [
        'Cardiology & Internal Medicine',
        'Pediatrics & Neonatology',
        'Orthopedics & Joint Care',
        'Gynecology & Obstetrics',
        'Neurology',
        'General Surgery'
      ],
      operationalHours: '24/7 Emergency & OPD (08:00 AM - 08:00 PM)',
      slotIntervalMinutes: 30
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
