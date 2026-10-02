import { neon } from '@neondatabase/serverless';

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

function getDatabaseClient() {
  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (!connectionString) {
    throw new Error('Shared demo data is not configured on the server.');
  }

  return neon(connectionString);
}

function sendError(res: any, status: number, message: string) {
  return res.status(status).json({ error: message });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method not allowed');
  }

  let sql: ReturnType<typeof getDatabaseClient>;
  try {
    sql = getDatabaseClient();
  } catch (error) {
    return sendError(res, 500, (error as Error).message);
  }

  try {
    if (req.method === 'GET') {
      const records = await sql`
        SELECT collection, record_id, data, updated_at
        FROM ihms_demo_records
        ORDER BY updated_at DESC
        LIMIT 10000
      `;
      return res.status(200).json(records);
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
      await sql`
        INSERT INTO ihms_demo_records (collection, record_id, data)
        SELECT ${collection}, item->>'id', item
        FROM jsonb_array_elements(${JSON.stringify(records)}::jsonb) AS item
        ON CONFLICT (collection, record_id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
    }

    if (deletedIds.length > 0) {
      await sql`
        DELETE FROM ihms_demo_records
        WHERE collection = ${collection}
          AND record_id IN (
            SELECT jsonb_array_elements_text(${JSON.stringify(deletedIds)}::jsonb)
          )
      `;
    }

    return res.status(204).end();
  } catch (error) {
    console.error('Vercel PostgreSQL shared-data request failed:', error);
    return sendError(res, 502, 'Could not access shared demo data.');
  }
}
