import { createClient } from '@supabase/supabase-js'

// Use environment variables for Supabase configuration
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://edpfubyjpjadigoibrde.supabase.co'
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkcGZ1YnlqcGphZGlnb2licmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIzNjYyOTksImV4cCI6MjA1Nzk0MjI5OX0.wj3BosyWD3ka4ZI3aMWJxZ2IUVY9mEfUDlzgKiN7FBI'

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
