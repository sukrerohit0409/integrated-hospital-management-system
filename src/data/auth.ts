import type { User, UserRole } from '../types';
import { requireSupabase } from '../lib/supabase';

type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  details: Omit<Partial<User>, 'id' | 'name' | 'email' | 'phone' | 'role'>;
  created_at: string;
};

export async function getSignedInProfile(): Promise<User | null> {
  const client = requireSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) return null;

  const { data, error } = await client
    .from('profiles')
    .select('id,name,email,phone,role,details,created_at')
    .eq('id', user.id)
    .single<Profile>();
  if (error) throw error;

  if (data.details.status === 'inactive') {
    throw new Error('This account is inactive. Contact a hospital administrator.');
  }

  return {
    ...data.details,
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: data.role,
    isOnline: true,
    status: data.details.status || 'active',
    createdAt: data.created_at,
  };
}
