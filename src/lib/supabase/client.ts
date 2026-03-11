import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  // Return cached client if exists
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build time, env vars may not be available
  if (!supabaseUrl || !supabaseKey) {
    // Return a mock client that won't break the build
    // This should never be called in actual runtime
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }

  client = createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
