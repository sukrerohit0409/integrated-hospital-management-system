const COLLECTIONS = new Set([
  'ihms_users',
  'ihms_appointments',
  'ihms_attendance',
  'ihms_revenue',
  'ihms_expenses',
  'ihms_leaves',
  'ihms_settings',
]);

type DemoRecord = {
  id: string;
  [key: string]: unknown;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Shared demo data is not configured on the server.');
  }

  return {
    baseUrl: `${url.replace(/\/$/, '')}/rest/v1/ihms_demo_records`,
    serviceKey,
  };
}

function supabaseHeaders(serviceKey: string, prefer?: string): HeadersInit {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function sendError(res: any, status: number, message: string) {
  return res.status(status).json({ error: message });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method not allowed');
  }

  let config: ReturnType<typeof getSupabaseConfig>;
  try {
    config = getSupabaseConfig();
  } catch (error) {
    return sendError(res, 500, (error as Error).message);
  }

  if (req.method === 'GET') {
    const response = await fetch(
      `${config.baseUrl}?select=collection,record_id,data,updated_at&order=updated_at.desc&limit=10000`,
      { headers: supabaseHeaders(config.serviceKey) },
    );

    if (!response.ok) {
      console.error('Supabase read failed:', await response.text());
      return sendError(res, 502, 'Could not load shared demo data.');
    }

    return res.status(200).json(await response.json());
  }

  const { collection, records, deletedIds } = req.body ?? {};
  if (
    typeof collection !== 'string' ||
    !COLLECTIONS.has(collection) ||
    !Array.isArray(records) ||
    records.length > 250 ||
    !Array.isArray(deletedIds) ||
    deletedIds.length > 250 ||
    !records.every(
      (record: DemoRecord) =>
        record &&
        typeof record === 'object' &&
        typeof record.id === 'string' &&
        record.id.length > 0,
    ) ||
    !deletedIds.every((id: unknown) => typeof id === 'string' && id.length > 0)
  ) {
    return sendError(res, 400, 'Invalid shared-data update.');
  }

  if (records.length > 0) {
    const response = await fetch(
      `${config.baseUrl}?on_conflict=collection,record_id`,
      {
        method: 'POST',
        headers: supabaseHeaders(config.serviceKey, 'resolution=merge-duplicates,return=minimal'),
        body: JSON.stringify(
          records.map((data: DemoRecord) => ({
            collection,
            record_id: data.id,
            data,
          })),
        ),
      },
    );

    if (!response.ok) {
      console.error('Supabase write failed:', await response.text());
      return sendError(res, 502, 'Could not save shared demo data.');
    }
  }

  for (const id of deletedIds as string[]) {
    const query = new URLSearchParams({
      collection: `eq.${collection}`,
      record_id: `eq.${id}`,
    });
    const response = await fetch(`${config.baseUrl}?${query}`, {
      method: 'DELETE',
      headers: supabaseHeaders(config.serviceKey),
    });

    if (!response.ok) {
      console.error('Supabase delete failed:', await response.text());
      return sendError(res, 502, 'Could not delete shared demo data.');
    }
  }

  return res.status(204).end();
}
