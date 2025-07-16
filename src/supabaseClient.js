import { createClient } from '@supabase/supabase-js'

// Use only environment variables for Supabase configuration
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  }
})

// Export API functions for direct Supabase access
export const auth = supabase.auth
export const storage = supabase.storage
export const from = supabase.from 
