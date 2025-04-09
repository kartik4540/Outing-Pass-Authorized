import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBookedSlots, handleBookingAction, fetchPendingBookings, fetchLockedSlots, lockSlot, unlockSlot } from '../services/api';
import { supabase } from '../supabaseClient';
import './PendingBookings.css';

const PendingBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('waiting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [counts, setCounts] = useState({ waiting: 0, confirmed: 0, rejected: 0 });
  const [showLockSlotModal, setShowLockSlotModal] = useState(false);
  const [selectedLab, setSelectedLab] = useState('');
  const [selectedDayOrder, setSelectedDayOrder] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [lockedSlots, setLockedSlots] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    checkAdminAndFetchBookings();
  }, []);

  const checkAdminAndFetchBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const adminEmails = ['km5260@srmist.edu.in', 'manorant@srmist.edu.in', 'rk0598@srmist.edu.in'];
      if (!adminEmails.includes(user.email)) {
        navigate('/');
        return;
      }

      await fetchAllBookings(user.email);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to authenticate');
    }
  };

  const fetchAllBookings = async (adminEmail) => {
    try {
      setLoading(true);
      const bookingsData = await fetchPendingBookings(adminEmail) || [];
      const filteredBookings = selectedStatus === 'all' 
        ? bookingsData 
        : bookingsData.filter(booking => booking.status === selectedStatus);
      
      setBookings(filteredBookings);
      
      const waiting = bookingsData.filter(booking => booking.status === 'waiting').length;
      const confirmed = bookingsData.filter(booking => booking.status === 'confirmed').length;
      const rejected = bookingsData.filter(booking => booking.status === 'rejected').length;
      setCounts({ waiting, confirmed, rejected });
      
      setError(null);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      if (error.message && error.message.includes('Failed to fetch')) {
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status) => {
    setSelectedStatus(status);
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      if (bookings.length > 0) {
        const filteredBookings = status === 'all' 
          ? bookings 
          : bookings.filter(booking => booking.status === status);
        setBookings(filteredBookings);
      } else {
        await fetchAllBookings(user.email);
      }
      setError(null);
    } catch (error) {
      console.error('Error changing status filter:', error);
      setError('Failed to filter bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleLockSlot = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await lockSlot({
        lab: selectedLab,
        timeSlot: selectedTimeSlot,
        dayOrder: selectedDayOrder,
        reason: lockReason
      }, user.email);

      setSuccess('Slot locked successfully');
      setShowLockSlotModal(false);
      await fetchLockedSlotsForLab();
    } catch (error) {
      console.error('Error locking slot:', error);
      setError('Failed to lock slot. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockSlot = async (slotId) => {
    try {
      setLoading(true);
      await unlockSlot(slotId);
      setSuccess('Slot unlocked successfully');
      await fetchLockedSlotsForLab();
    } catch (error) {
      console.error('Error unlocking slot:', error);
      setError('Failed to unlock slot. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLockedSlotsForLab = async () => {
    if (!selectedLab || !selectedDayOrder) return;
    try {
      const slots = await fetchLockedSlots(selectedLab, selectedDayOrder);
      setLockedSlots(slots);
    } catch (error) {
      console.error('Error fetching locked slots:', error);
    }
  };

  const processBookingAction = async (bookingId, action) => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Process the booking action with admin info
      const result = await handleBookingAction(bookingId, action, user.email);
      
      // Show success message
      setSuccess(`Booking ${action === 'confirm' ? 'confirmed' : 'rejected'} successfully by ${user.email}`);
      
      // Refresh bookings with current filter
      await handleStatusChange(selectedStatus);
      
      return result;
    } catch (error) {
      console.error(`Error ${action}ing booking:`, error);
      setError(`Failed to ${action} booking. Please try again later.`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="pending-bookings-page">
      <h2>Lab Bookings</h2>
      
      {/* Lock Slot Section */}
      <div className="lock-slot-section">
        <h3>Manage Locked Slots</h3>
        <div className="lock-slot-controls">
          <select 
            value={selectedLab} 
            onChange={(e) => setSelectedLab(e.target.value)}
          >
            <option value="">Select Lab</option>
            <option value="LAB A">LAB A</option>
            <option value="LAB B">LAB B</option>
            <option value="LAB C">LAB C</option>
            <option value="LAB D">LAB D</option>
          </select>

          <select 
            value={selectedDayOrder} 
            onChange={(e) => setSelectedDayOrder(e.target.value)}
          >
            <option value="">Select Day Order</option>
            <option value="1">Day 1</option>
            <option value="2">Day 2</option>
            <option value="3">Day 3</option>
            <option value="4">Day 4</option>
            <option value="5">Day 5</option>
          </select>

          <button 
            className="lock-slot-button"
            onClick={() => setShowLockSlotModal(true)}
            disabled={!selectedLab || !selectedDayOrder}
          >
            Lock New Slot
          </button>
        </div>

        {/* Locked Slots List */}
        {lockedSlots.length > 0 && (
          <div className="locked-slots-list">
            <h4>Locked Slots</h4>
            {lockedSlots.map(slot => (
              <div key={slot.id} className="locked-slot-item">
                <div className="locked-slot-info">
                  <span>Time: {slot.time_slot}</span>
                  <span>Locked by: {slot.locked_by}</span>
                  {slot.reason && <span>Reason: {slot.reason}</span>}
                </div>
                <button 
                  className="unlock-button"
                  onClick={() => handleUnlockSlot(slot.id)}
                >
                  Unlock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lock Slot Modal */}
      {showLockSlotModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Lock Time Slot</h3>
            <select 
              value={selectedTimeSlot} 
              onChange={(e) => setSelectedTimeSlot(e.target.value)}
            >
              <option value="">Select Time Slot</option>
              <option value="08:00-08:50">8:00 AM - 8:50 AM</option>
              <option value="08:50-09:40">8:50 AM - 9:40 AM</option>
              <option value="09:45-10:35">9:45 AM - 10:35 AM</option>
              <option value="10:40-11:30">10:40 AM - 11:30 AM</option>
              <option value="11:35-12:25">11:35 AM - 12:25 PM</option>
              <option value="12:30-01:20">12:30 PM - 1:20 PM</option>
              <option value="01:25-02:15">1:25 PM - 2:15 PM</option>
              <option value="02:20-03:10">2:20 PM - 3:10 PM</option>
              <option value="03:10-04:00">3:10 PM - 4:00 PM</option>
              <option value="04:00-04:50">4:00 PM - 4:50 PM</option>
            </select>
            <textarea
              placeholder="Reason for locking (optional)"
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
            />
            <div className="modal-buttons">
              <button onClick={() => setShowLockSlotModal(false)}>Cancel</button>
              <button 
                onClick={handleLockSlot}
                disabled={!selectedTimeSlot}
                className="lock-confirm-button"
              >
                Lock Slot
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="action-note">
        <p>Note: Please click buttons twice for correct details to update</p>
      </div>
      {success && <div className="success-message">{success}</div>}
      
      <div className="status-filter-buttons">
        <button
          className={`status-button ${selectedStatus === 'waiting' ? 'active' : ''}`}
          onClick={() => handleStatusChange('waiting')}
        >
          Waiting ({counts.waiting})
        </button>
        <button
          className={`status-button ${selectedStatus === 'confirmed' ? 'active' : ''}`}
          onClick={() => handleStatusChange('confirmed')}
        >
          Confirmed ({counts.confirmed})
        </button>
        <button
          className={`status-button ${selectedStatus === 'rejected' ? 'active' : ''}`}
          onClick={() => handleStatusChange('rejected')}
        >
          Rejected ({counts.rejected})
        </button>
      </div>
      
      {bookings.length > 0 ? (
        <div className="bookings-list">
          {bookings.map(booking => (
            <div key={booking.id} className="booking-card">
              <div className={`status-badge ${booking.status}`}>
                {booking.status.toUpperCase()}
                {booking.handled_by && booking.status !== 'waiting' && (
                  <span className="handler-info">
                    • Handled by {booking.handled_by}
                  </span>
                )}
              </div>
              <div className="booking-info">
                <div className="info-group">
                  <h3>User Details</h3>
                  <p><strong>Name:</strong> {booking.name}</p>
                  <p><strong>Email:</strong> {booking.email}</p>
                  <p><strong>Faculty ID:</strong> {booking.faculty_id}</p>
                  <p><strong>Department:</strong> {booking.department}</p>
                </div>
                <div className="info-group">
                  <h3>Booking Details</h3>
                  <p><strong>Date:</strong> {booking.formatted_date || booking.date}</p>
                  <p><strong>Day Order:</strong> {booking.day_order}</p>
                  <p><strong>Lab:</strong> {booking.lab}</p>
                  <p><strong>Time Slot:</strong> {booking.time_slot}</p>
                  {booking.handled_by && booking.status !== 'waiting' && (
                    <p className="handled-time">
                      <strong>Handled on:</strong> {booking.handled_at ? new Date(booking.handled_at).toLocaleString() : ''}
                    </p>
                  )}
                </div>
              </div>
              {selectedStatus === 'waiting' && (
                <div className="action-buttons">
                  <button
                    onClick={() => processBookingAction(booking.id, 'confirm')}
                    className="confirm-button"
                    disabled={loading}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => processBookingAction(booking.id, 'reject')}
                    className="reject-button"
                    disabled={loading}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="no-bookings">No {selectedStatus} bookings available</div>
      )}
    </div>
  );
};

export default PendingBookings; 