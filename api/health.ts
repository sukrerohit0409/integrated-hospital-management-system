/**
 * Vercel Serverless Function compatible health & status route
 */
export default async function handler(req: any, res: any) {
  if (res && typeof res.status === 'function') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    return res.status(200).json({
      status: 'healthy',
      system: 'Integrated Hospital Management System (IHMS)',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }
  return new Response(JSON.stringify({
    status: 'healthy',
    system: 'Integrated Hospital Management System (IHMS)',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
