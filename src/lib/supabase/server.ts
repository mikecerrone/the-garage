import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY;

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from Server Component
        }
      },
    },
  });
}

// Admin client with service role key for server-side operations
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || PLACEHOLDER_KEY;

  return createServerClient(supabaseUrl, serviceKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}
