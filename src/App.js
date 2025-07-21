import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Navbar from './components/Navbar';
import SlotBooking from './pages/SlotBooking';
import PendingBookings from './pages/PendingBookings';
import Login from './pages/Login';
import AdminStudentInfo from './pages/AdminStudentInfo';
import { fetchAdminInfoByEmail } from './services/api';
import ArchGateLogin from './pages/ArchGateLogin';
import ArchGateOTP from './pages/ArchGateOTP';
import ArchGateOutingDetails from './pages/ArchGateOutingDetails';
import WardenLogin from './pages/WardenLogin';
import './App.css';
import Toast from './components/Toast';

function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [adminHostels, setAdminHostels] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'info' });

  useEffect(() => {
    setSessionLoading(true);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) {
          if (!session.user.email.endsWith('@srmist.edu.in')) {
            setToast({ message: 'Please use your SRM email to log in.', type: 'error' });
            await supabase.auth.signOut();
            setUser(null);
            setIsAdmin(false);
            setAdminRole(null);
            setAdminHostels([]);
            // Clear all sessionStorage for all roles
            sessionStorage.clear();
            setSessionLoading(false);
            return;
          }
        setUser(session.user);
          setAdminLoading(true);
          checkAdminStatus(session.user.email).finally(() => setAdminLoading(false));
        } else {
          setUser(null);
          setIsAdmin(false);
          setAdminRole(null);
          setAdminHostels([]);
        }
      } catch (err) {
        console.error('Error during session check:', err);
      } finally {
        setSessionLoading(false);
      }
    }).catch((err) => {
      console.error('Error in getSession:', err);
      setSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        setSessionLoading(true);
        if (session?.user) {
          if (!session.user.email.endsWith('@srmist.edu.in')) {
            setToast({ message: 'Please use your SRM email to log in.', type: 'error' });
            await supabase.auth.signOut();
            setUser(null);
            setIsAdmin(false);
            setAdminRole(null);
            setAdminHostels([]);
            // Clear all sessionStorage for all roles
            sessionStorage.clear();
            setSessionLoading(false);
            return;
          }
        setUser(session.user);
          setAdminLoading(true);
          checkAdminStatus(session.user.email).finally(() => setAdminLoading(false));
      } else {
        setUser(null);
        setIsAdmin(false);
          setAdminRole(null);
          setAdminHostels([]);
        }
      } catch (err) {
        console.error('Error during auth state change:', err);
      } finally {
        setSessionLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = async (email) => {
    try {
      const adminInfo = await fetchAdminInfoByEmail(email);
      if (adminInfo) {
        setIsAdmin(true);
        setAdminRole(adminInfo.role);
        setAdminHostels(adminInfo.hostels || []);
      } else {
        setIsAdmin(false);
        setAdminRole(null);
        setAdminHostels([]);
      }
    } catch (err) {
      console.error('Error fetching admin info:', err);
      setIsAdmin(false);
      setAdminRole(null);
      setAdminHostels([]);
    }
  };

  const wardenLoggedIn = typeof window !== 'undefined' && sessionStorage.getItem('wardenLoggedIn') === 'true';

  if (sessionLoading) {
    return <div style={{textAlign:'center',marginTop:'100px',fontSize:'1.2em'}}>Loading session...</div>;
  }

  return (
    <Router>  
      <div className="app">
        <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
        <Navbar user={user} isAdmin={isAdmin} adminLoading={adminLoading} />
        <main className="main-content">
          <Routes>
            <Route 
              path="/pending-bookings" 
              element={
                wardenLoggedIn
                  ? <PendingBookings />
                  : user
                    ? (adminLoading ? <div>Checking admin status...</div> : (isAdmin ? <PendingBookings adminRole={adminRole} adminHostels={adminHostels} /> : <Login />))
                    : <Login />
              }
            />
            <Route 
              path="/slot-booking" 
              element={user ? <SlotBooking /> : <Login />} 
            />
            <Route path="/login" element={<Login />} />
            <Route 
              path="/admin-student-info" 
              element={
                wardenLoggedIn
                  ? <AdminStudentInfo />
                  : user
                    ? (adminLoading ? <div>Checking admin status...</div> : (isAdmin ? <AdminStudentInfo /> : <Login />))
                    : <Login />
              }
            />
            <Route path="/warden-login" element={<WardenLogin />} />
            <Route path="/" element={user ? <SlotBooking /> : <Login />} />
            <Route path="/arch-gate-login" element={<ArchGateLogin />} />
            <Route path="/arch-otp" element={<ArchGateOTP />} />
            <Route path="/arch-outing-details" element={<ArchGateOutingDetails />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App; 