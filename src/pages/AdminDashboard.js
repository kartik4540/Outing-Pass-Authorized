import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { fetchPendingBookings, handleBookingAction } from '../services/api';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('waiting');
  const [user, setUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [processingBookingId, setProcessingBookingId] = useState(null);
  const [isTabSwitchLocked, setIsTabSwitchLocked] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const initializeAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          await fetchAllBookings(user.email);
        }
      } catch (error) {
        console.error('Error initializing admin:', error);
        setError('Failed to initialize admin dashboard');
      }
    };

    initializeAdmin();
  }, []);

  const fetchAllBookings = async (adminEmail) => {
    try {
      setLoading(true);
      const data = await fetchPendingBookings(adminEmail);
      setBookings(data);
      setError('');
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setError('Failed to fetch bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (bookingId, action) => {
    if (actionLoading || processingBookingId || isTabSwitchLocked) return;

    const currentTime = new Date().getTime();
    const timeDiff = currentTime - lastClickTime.time;
    const isDoubleClick = timeDiff < 300 && lastClickTime.id === bookingId && lastClickTime.action === action;

    // Update last click time
    setLastClickTime({ id: bookingId, time: currentTime, action: action });

    // Only proceed if it's a double click
    if (!isDoubleClick) {
      return;
    }
    
    try {
      setActionLoading(true);
      setProcessingBookingId(bookingId);
      setIsTabSwitchLocked(true);
      setError('');

      // First update the booking status
      await handleBookingAction(bookingId, action, user.email);
      
      // Then fetch fresh data
      const freshData = await fetchPendingBookings(user.email);
      
      // Update the bookings data
      setBookings(freshData);

      // Wait for state to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Switch to the new status tab only after successful double-click and action
      const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
      setSelectedStatus(newStatus);
      
    } catch (error) {
      console.error('Error updating booking status:', error);
      setError('Failed to update booking status. Please try again.');
    } finally {
      setActionLoading(false);
      setProcessingBookingId(null);
      setLoading(false);
      
      // Reset last click time after action completes
      setLastClickTime({ id: null, time: 0, action: null });
      
      // Unlock tab switching after a short delay
      setTimeout(() => {
        setIsTabSwitchLocked(false);
      }, 300);
    }
  };

  // Prevent filter changes during any loading state or tab switch lock
  const handleFilterClick = (status) => {
    if (actionLoading || loading || isTabSwitchLocked) return;
    setSelectedStatus(status);
    setError('');
  };

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleDateFilterChange = useCallback((e) => {
    setDateFilter(e.target.value);
  }, []);

  const handleStatusFilterChange = useCallback((e) => {
    setStatusFilter(e.target.value);
  }, []);

  // Client-side filtering with strict status check and additional validation
  const filteredBookings = useMemo(() => bookings.filter(booking => {
    if (!booking || !booking.status) return false;
    if (selectedStatus === 'all') return true;
    return booking.status.toLowerCase() === selectedStatus.toLowerCase();
  }), [bookings, selectedStatus]);

  // Calculate counts with validation
  const bookingCounts = useMemo(() => bookings.reduce((acc, booking) => {
    if (booking && booking.status) {
      const status = booking.status.toLowerCase();
      acc[status] = (acc[status] || 0) + 1;
    }
    return acc;
  }, {}), [bookings]);

  return (
    <div className="admin-dashboard">
      <h1>Outing Requests</h1>

      <div className="booking-filters">
        <button 
          className={`filter-button ${selectedStatus === 'waiting' ? 'active' : ''}`}
          onClick={() => handleFilterClick('waiting')}
          disabled={actionLoading || isTabSwitchLocked}
        >
          Waiting ({bookingCounts.waiting || 0})
        </button>
        <button 
          className={`filter-button ${selectedStatus === 'confirmed' ? 'active' : ''}`}
          onClick={() => handleFilterClick('confirmed')}
          disabled={actionLoading || isTabSwitchLocked}
        >
          Confirmed ({bookingCounts.confirmed || 0})
        </button>
        <button 
          className={`filter-button ${selectedStatus === 'rejected' ? 'active' : ''}`}
          onClick={() => handleFilterClick('rejected')}
          disabled={actionLoading || isTabSwitchLocked}
        >
          Rejected ({bookingCounts.rejected || 0})
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading bookings...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : filteredBookings.length === 0 ? (
        <div className="no-bookings">
          No {selectedStatus !== 'all' ? selectedStatus : ''} requests available
        </div>
      ) : (
        <div className="bookings-list">
          {filteredBookings.map((booking) => (
            <div key={booking.id} className={`booking-card ${booking.status}`}>
              <div className="booking-status-badge">{booking.status}</div>
              <div className="booking-info">
                <h3>Booking Details</h3>
                <p><strong>Faculty ID:</strong> {booking.faculty_id}</p>
                <p><strong>Name:</strong> {booking.name}</p>
                <p><strong>Email:</strong> {booking.email}</p>
                <p><strong>Department:</strong> {booking.department}</p>
                <p><strong>Out Date:</strong> {booking.out_date}</p>
                <p><strong>Out Time:</strong> {booking.out_time}</p>
                <p><strong>In Date:</strong> {booking.in_date}</p>
                <p><strong>In Time:</strong> {booking.in_time}</p>
              </div>
              {booking.status === 'waiting' && (
                <div className="booking-actions">
                  <div className="double-click-note" style={{ 
                    color: '#666', 
                    fontSize: '0.9em', 
                    marginBottom: '10px',
                    textAlign: 'center',
                    fontStyle: 'italic'
                  }}>
                    Note: Double-click on buttons for accurate action
                  </div>
                  <button
                    className="action-button confirm"
                    onDoubleClick={() => handleStatusChange(booking.id, 'confirm')}
                    onClick={(e) => e.preventDefault()}
                    disabled={actionLoading || processingBookingId === booking.id || isTabSwitchLocked}
                    title="Double-click to confirm"
                  >
                    {processingBookingId === booking.id ? 'Processing...' : 'Double-click to Confirm'}
                  </button>
                  <button
                    className="action-button reject"
                    onDoubleClick={() => handleStatusChange(booking.id, 'reject')}
                    onClick={(e) => e.preventDefault()}
                    disabled={actionLoading || processingBookingId === booking.id || isTabSwitchLocked}
                    title="Double-click to reject"
                  >
                    {processingBookingId === booking.id ? 'Processing...' : 'Double-click to Reject'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard; 