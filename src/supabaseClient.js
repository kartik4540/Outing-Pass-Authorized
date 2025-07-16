import { createClient } from '@supabase/supabase-js'

// Use environment variables for Supabase configuration
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://fwnknmqlhlyxdeyfcrad.supabase.co'
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3bmtubXFsaGx5eGRleWZjcmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyNzE2OTAsImV4cCI6MjA2Njg0NzY5MH0.n8Ya1eNVeATZXkLHoHdR7t8-NaxMtmtbQiZJzuqSsuA'

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
