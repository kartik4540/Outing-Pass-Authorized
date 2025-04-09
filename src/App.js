import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import SlotBooking from './pages/SlotBooking';
import PendingBookings from './pages/PendingBookings';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Instructors from './pages/Instructors';
import Schedule from './pages/Schedule';
import AdminSlotManagement from './pages/AdminSlotManagement';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check for initial user session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        checkAdminStatus(session.user.email);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        checkAdminStatus(session.user.email);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = (email) => {
    const adminEmails = ['km5260@srmist.edu.in', 'manorant@srmist.edu.in', 'rk0598@srmist.edu.in'];
    setIsAdmin(adminEmails.includes(email));
  };

  return (
    <Router>  
      <div className="app">
        <Navbar user={user} isAdmin={isAdmin} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route 
              path="/pending-bookings" 
              element={isAdmin ? <PendingBookings /> : <Home />} 
            />
            <Route 
              path="/slot-booking" 
              element={user ? <SlotBooking /> : <Login />} 
            />
            <Route 
              path="/admin-slot-management" 
              element={isAdmin ? <AdminSlotManagement /> : <Home />} 
            />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/instructors" element={<Instructors />} />
            <Route path="/schedule" element={<Schedule />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App; 