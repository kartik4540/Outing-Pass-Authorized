import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

const ProtectedRoute = ({ children }) => {
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        console.log('Session check:', { session, error })
        
        if (error) {
          console.error('Session error:', error)
          throw error
        }
        
        if (!session) {
          console.log('No session found, redirecting to auth')
          navigate('/auth')
          return
        }

        // If we have a session, verify it's still valid
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.log('No user found, redirecting to auth')
          navigate('/auth')
          return
        }

        console.log('Valid session found:', user)
        setLoading(false)
      } catch (error) {
        console.error('Error checking auth status:', error)
        navigate('/auth')
      }
    }

    // Check for existing session
    checkUser()

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session)
      if (event === 'SIGNED_OUT') {
        navigate('/auth')
      } else if (event === 'SIGNED_IN' && session) {
        setLoading(false)
      }
    })

    // Cleanup subscription
    return () => {
      if (subscription) subscription.unsubscribe()
    }
  }, [navigate])

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    )
  }

  return children
}

export default ProtectedRoute 