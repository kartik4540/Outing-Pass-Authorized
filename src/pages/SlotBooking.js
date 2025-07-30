import React, { useState, useEffect, useMemo, useCallback, useReducer } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  bookSlot, 
  fetchBookedSlots, 
  deleteBookedSlot, 
  checkApiHealth,
  fetchPendingBookings,
  handleBookingAction,
  fetchStudentInfoByEmail,
  fetchAdminInfoByEmail,
  checkAndAutoUnban
} from '../services/api';
import './SlotBooking.css';
import { supabase } from '../supabaseClient';

const initialState = {
  bookingForm: {
    name: '',
    email: '',
    department: '',
    roomNumber: '',
    outDate: '',
    outTime: '',
    inDate: '',
    inTime: '',
    parentEmail: '',
    parentPhone: '',
    reason: '',
  },
  loading: false,
  bookedSlots: [],
  error: '',
  success: '',
  apiError: false,
  user: null,
  isAdmin: false,
  studentInfoExists: true,
  banInfo: null,
  blockBooking: false,
  waitingBooking: null
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_BOOKING_FORM':
      return { ...state, bookingForm: action.payload };
    case 'SET_BOOKING_FIELD':
      return { ...state, bookingForm: { ...state.bookingForm, [action.field]: action.value } };
    case 'RESET_BOOKING_FORM':
      return { ...state, bookingForm: { ...initialState.bookingForm, email: state.bookingForm.email } };
    case 'SET_USER_INFO':
      return { ...state, user: action.payload.user, bookingForm: { ...state.bookingForm, ...action.payload.formDetails } };
    case 'SET_BOOKINGS':
      return { ...state, bookedSlots: action.payload.bookings, bookingCounts: action.payload.counts };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, success: '' };
    case 'SET_SUCCESS':
      return { ...state, success: action.payload, error: '' };
    default:
      return state;
  }
}

const SlotBooking = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    bookingForm, loading, bookedSlots, error, success, apiError, user, isAdmin,
    studentInfoExists, banInfo, blockBooking, waitingBooking
  } = state;

  const fetchUserBookings = useCallback(async (email) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const bookingsData = await fetchBookedSlots(email);
      dispatch({ 
        type: 'SET_BOOKINGS', 
        payload: {
          bookings: bookingsData || [],
          counts: bookingsData?.counts || { waiting: 0, confirmed: 0, rejected: 0 }
        }
      });
      dispatch({ type: 'SET_ERROR', payload: '' });
    } catch (err) {
      if (err.message !== 'No bookings found') {
        dispatch({ type: 'SET_ERROR', payload: '' });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  useEffect(() => {
    const checkServerHealth = async () => {
      const isHealthy = await checkApiHealth();
      dispatch({ type: 'SET_FIELD', field: 'apiError', value: !isHealthy });
    };
    
    const initializeUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let name = user.user_metadata?.full_name || user.email;
          let email = user.email;
          let department = '';
          let parentEmail = '';
          let parentPhone = '';
          const adminInfo = await fetchAdminInfoByEmail(email);
          dispatch({ type: 'SET_FIELD', field: 'isAdmin', value: !!adminInfo });
          const info = await fetchStudentInfoByEmail(email);
          if (info) {
            department = info.hostel_name;
            parentEmail = info.parent_email || '';
            parentPhone = info.parent_phone || '';
            dispatch({ type: 'SET_FIELD', field: 'studentInfoExists', value: true });
          } else {
            dispatch({ type: 'SET_FIELD', field: 'studentInfoExists', value: false });
          }
          dispatch({ 
            type: 'SET_USER_INFO', 
            payload: { 
              user, 
              formDetails: { email, name, department, parentEmail, parentPhone } 
            }
          });
          const ban = await checkAndAutoUnban(email);
          dispatch({ type: 'SET_FIELD', field: 'banInfo', value: ban });
          if (user.email) {
            await fetchUserBookings(user.email);
          }
        }
      } catch (error) {
        // console.error('Error initializing user:', error);
      }
    };
    
    checkServerHealth();
    initializeUser();
    
    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("date");
    if (dateInput) {
      dateInput.setAttribute("min", today);
    }
  }, [fetchUserBookings]);

  useEffect(() => {
    const block = (bookedSlots || []).some(b => b.status === 'waiting' || b.status === 'still_out');
    dispatch({ type: 'SET_FIELD', field: 'blockBooking', value: block });
  }, [bookedSlots]);

  const handleBookingChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === 'email') return;
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    dispatch({ type: 'SET_BOOKING_FIELD', field: name, value });
  }, []);

  const handleRetryConnection = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const isHealthy = await checkApiHealth();
    dispatch({ type: 'SET_FIELD', field: 'apiError', value: !isHealthy });
    dispatch({ type: 'SET_LOADING', payload: false });
  };

  const handleBookingSubmit = useCallback(async (e) => {
    e.preventDefault();
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    if ((bookedSlots || []).some(b => b.status === 'waiting' || b.status === 'still_out')) {
      dispatch({ type: 'SET_ERROR', payload: 'You already have a pending or active outing request.' });
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }
    try {
      if (!bookingForm.name || !bookingForm.email || !bookingForm.department || !bookingForm.roomNumber || !bookingForm.outDate || !bookingForm.outTime || !bookingForm.inDate || !bookingForm.inTime || !bookingForm.parentEmail) {
        throw new Error('Please fill all required fields.');
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(bookingForm.parentEmail)) {
        throw new Error('Please enter a valid parent email address.');
      }
      const bookingData = {
        name: bookingForm.name,
        email: bookingForm.email,
        hostelName: bookingForm.department,
        roomNumber: bookingForm.roomNumber,
        outDate: bookingForm.outDate,
        outTime: bookingForm.outTime,
        inDate: bookingForm.inDate,
        inTime: bookingForm.inTime,
        parentEmail: bookingForm.parentEmail,
        parentPhone: bookingForm.parentPhone,
        reason: bookingForm.reason,
        status: 'waiting'
      };
      const response = await bookSlot(bookingData);
      if (response.success) {
        dispatch({ type: 'SET_SUCCESS', payload: 'Request submitted successfully!' });
        dispatch({ type: 'RESET_BOOKING_FORM' });
        await fetchUserBookings(bookingForm.email);
      } else {
        throw new Error(response.error || 'Failed to create booking.');
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Failed to create booking.' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [bookingForm, fetchUserBookings, bookedSlots]);

  const handleDeleteBooking = useCallback(async (bookingId) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    try {
      await deleteBookedSlot(bookingId);
      dispatch({ type: 'SET_SUCCESS', payload: 'Booking deleted successfully. You can now make a new request.' });
      await fetchUserBookings(bookingForm.email);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to delete booking' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [bookingForm.email, fetchUserBookings]);

  const handleDeleteWaiting = useCallback(async () => {
    if (!waitingBooking) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    try {
      await deleteBookedSlot(waitingBooking.id);
      dispatch({ type: 'SET_SUCCESS', payload: 'Booking deleted successfully. You can now make a new request.' });
      await fetchUserBookings(bookingForm.email);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to delete booking' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [waitingBooking, bookingForm.email, fetchUserBookings]);

  const latestOtpBooking = useMemo(() =>
    (bookedSlots || [])
      .filter(b => (b.status === 'still_out' || b.status === 'confirmed') && b.otp)
      .sort((a, b) => new Date(b.created_at || b.out_date || b.in_date) - new Date(a.created_at || a.out_date || a.in_date))[0]
  , [bookedSlots]);

  const currentBooking = useMemo(() =>
    (bookedSlots || [])
      .filter(b => b.status === 'waiting' || b.status === 'still_out')
      .sort((a, b) => new Date(b.created_at || b.out_date || b.in_date) - new Date(a.created_at || a.out_date || a.in_date))[0]
  , [bookedSlots]);

  const oldConfirmedBookings = useMemo(() =>
    (bookedSlots || [])
      .filter(b => b.status === 'confirmed')
  , [bookedSlots]);

  const oldPastBookings = useMemo(() =>
    (bookedSlots || [])
      .filter(b => b.status === 'confirmed' || b.status === 'rejected')
  , [bookedSlots]);

  const handleDeleteBookingFactory = useCallback((id) => () => handleDeleteBooking(id), [handleDeleteBooking]);

  return (
    <div className="slot-booking-container">
      <h2>Request Outing</h2>
      
      {banInfo && (
        <div style={{ color: 'red', fontWeight: 600, marginBottom: 24, fontSize: 18 }}>
          You are banned from making outing requests until {banInfo.till_date}.
          {banInfo.reason && (
            <div style={{ marginTop: 8, fontWeight: 500, fontSize: 16 }}>
              <span style={{ color: '#b71c1c' }}>Reason: {banInfo.reason}</span>
            </div>
          )}
        </div>
      )}
      
      {blockBooking && (
        <div style={{ color: 'red', fontWeight: 600, marginBottom: 24, fontSize: 18 }}>
          You already have a pending or active outing request. Please complete or delete it before making a new one.
          {waitingBooking && (
            <div style={{ marginTop: 12 }}>
              <button onClick={handleDeleteWaiting} disabled={loading} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, cursor: 'pointer' }}>
                {loading ? 'Deleting...' : 'Delete Waiting Request'}
              </button>
            </div>
          )}
        </div>
      )}
      
      <form onSubmit={handleBookingSubmit} className="booking-form" style={{ pointerEvents: blockBooking ? 'none' : 'auto', opacity: blockBooking ? 0.5 : 1 }}>
        <label htmlFor="name">Full Name:</label>
        <input 
          type="text" 
          id="name" 
          name="name" 
          value={bookingForm.name}
          readOnly
          disabled
          className="readonly-input"
          required
          placeholder="Enter your full name"
        />

        <label htmlFor="email">Email (SRM):</label>
        <input 
          type="email" 
          id="email" 
          name="email" 
          value={bookingForm.email}
          readOnly
          disabled
          className="readonly-input"
        />

        <label htmlFor="department">Hostel Name:</label>
          <input
            type="text"
            id="department"
            name="department"
            value={bookingForm.department}
            readOnly
            disabled
            className="readonly-input"
          />

        <label htmlFor="roomNumber">Room Number:</label>
          <input
            type="text"
            id="roomNumber"
            name="roomNumber"
            value={bookingForm.roomNumber}
            onChange={handleBookingChange}
            required
            placeholder="Enter your room number"
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError}
          />

        <div className="form-group">
          <label htmlFor="outDate">Out Date:</label>
          <input
            type="date"
            id="outDate"
            name="outDate"
            value={bookingForm.outDate}
            onChange={handleBookingChange}
            required
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="form-group">
          <label htmlFor="outTime">Out Time:</label>
          <input
            type="time"
            id="outTime"
            name="outTime"
            value={bookingForm.outTime}
            onChange={handleBookingChange}
            required
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError}
          />
        </div>
        <div className="form-group">
          <label htmlFor="inDate">In Date:</label>
          <input
            type="date"
            id="inDate"
            name="inDate"
            value={bookingForm.inDate}
            onChange={handleBookingChange}
            required
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError}
            min={bookingForm.outDate || new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="form-group">
          <label htmlFor="inTime">In Time:</label>
          <input
            type="time"
            id="inTime"
            name="inTime"
            value={bookingForm.inTime}
            onChange={handleBookingChange}
            required
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError}
          />
        </div>
        <div className="form-group">
          <label htmlFor="reason">Reason for Outing:</label>
          <input
            type="text"
            id="reason"
            name="reason"
            value={bookingForm.reason}
            onChange={handleBookingChange}
            required
            placeholder="Enter reason for outing"
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError}
          />
        </div>

        <label htmlFor="parentEmail">Parent Email:</label>
        <input
          type="email"
          id="parentEmail"
          name="parentEmail"
          value={bookingForm.parentEmail}
          onChange={handleBookingChange}
          required
          placeholder="Enter parent email address"
          disabled={(!isAdmin && !studentInfoExists) || !!bookingForm.parentEmail}
        />

        <label htmlFor="parentPhone">Parent Phone:</label>
        <input
          type="text"
          id="parentPhone"
          name="parentPhone"
          value={bookingForm.parentPhone || ''}
          readOnly
          disabled
          className="readonly-input"
        />

        <div className="button-container">
          <button 
            type="submit"
            className="booking-button"
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError ||
              !bookingForm.name ||
              !bookingForm.email ||
              !bookingForm.department ||
              !bookingForm.roomNumber ||
              !bookingForm.outDate ||
              !bookingForm.outTime ||
              !bookingForm.inDate ||
              !bookingForm.inTime ||
              !bookingForm.parentEmail ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookingForm.parentEmail)
            }
          >
            {loading ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </form>

      {apiError && (
        <div className="error-container">
          <div className="error-message">
            <h3>Connection Error</h3>
            <p>Cannot connect to Supabase. Please check your internet connection or try again later.</p>
            <button 
              className="action-button"
              onClick={handleRetryConnection}
              disabled={loading}
            >
              {loading ? 'Trying to connect...' : 'Retry Connection'}
            </button>
          </div>
        </div>
      )}
      
      {error && (
        <div className="error-message" style={{
          position: 'sticky',
          top: '20px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          padding: '15px',
          borderRadius: '5px',
          marginBottom: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: 1000,
          whiteSpace: 'pre-line'  // This will preserve line breaks in the error message
        }}>
          {error}
        </div>
      )}
      
      {success && (
        <div className="success-message">
          {success}
        </div>
      )}
      
      {/* Render current request (left) and OTP (right) side by side at the top, then past confirmed outings below */}
      <div style={{ margin: '32px 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, marginBottom: 32, alignItems: 'flex-start' }}>
          {/* Left: Current Request */}
          <div style={{ flex: 1, minWidth: 340, display: 'flex', flexDirection: 'column', gap: 32 }}>
            {currentBooking ? (
              <div style={{ background: '#fff', border: '2px solid #ffc107', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px #0001', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <div style={{ position: 'absolute', top: 12, right: 12, background: '#ffe082', color: '#856404', borderRadius: 6, padding: '2px 12px', fontWeight: 700, fontSize: 14 }}>{currentBooking.status.toUpperCase()}</div>
                <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Current Request</div>
                <div><b>Out Date:</b> {currentBooking.out_date}</div>
                <div><b>Out Time:</b> {currentBooking.out_time}</div>
                <div><b>In Date:</b> {currentBooking.in_date}</div>
                <div><b>In Time:</b> {currentBooking.in_time}</div>
                <div><b>Reason:</b> {currentBooking.reason}</div>
                <div><b>Status:</b> {currentBooking.status}</div>
                {currentBooking.status === 'waiting' && (
                  <button onClick={handleDeleteBookingFactory(currentBooking.id)} disabled={loading} style={{ marginTop: 16, background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, cursor: 'pointer' }}>
                    {loading ? 'Deleting...' : 'Delete'}
            </button>
                )}
                {currentBooking && currentBooking.status === 'rejected' && currentBooking.rejection_reason && (
                  <div style={{ color: '#c62828', fontWeight: 600, margin: '12px 0' }}>
                    <b>Rejection Reason:</b> {currentBooking.rejection_reason}
                  </div>
                )}
          </div>
            ) : (
              // Placeholder to align OTP container
              <div style={{ height: 60, marginBottom: 0, visibility: 'hidden' }}></div>
                        )}
                      </div>
          {/* Right: OTP */}
          {latestOtpBooking && (
            <div style={{ flex: 1, minWidth: 320, background: '#f9fbe7', border: '1px solid #cddc39', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px #0001', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
              <h2 style={{ marginTop: 0, textAlign: 'right' }}>OTP for Arch Gate</h2>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, textAlign: 'right' }}>
                Out Date: {latestOtpBooking.out_date} | In Date: {latestOtpBooking.in_date}
                    </div>
              <div style={{ fontSize: 22, letterSpacing: 2, fontWeight: 700, color: '#33691e', marginBottom: 8, textAlign: 'right' }}>
                {latestOtpBooking.otp}
              </div>
              <div style={{ fontSize: 15, color: '#888', textAlign: 'right' }}>
                {latestOtpBooking.otp_used ? <span style={{ color: '#f44336', fontWeight: 'bold' }}>OTP Used</span> : 'Please present this OTP at the Arch Gate when returning to SRM.'}
              </div>
            </div>
          )}
        </div>
        {oldPastBookings.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ textAlign: 'left', marginBottom: 12 }}>Past Outings</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {oldPastBookings.map(booking => (
                <div key={booking.id} style={{ border: booking.status === 'confirmed' ? '2px solid #4caf50' : '2px solid #e57373', borderRadius: 12, padding: 20, background: '#fff', boxShadow: '0 2px 8px #0001', position: 'relative', marginBottom: 0, minWidth: 280 }}>
                  <div style={{ position: 'absolute', top: 12, right: 12, background: booking.status === 'confirmed' ? '#c8e6c9' : '#ffebee', color: booking.status === 'confirmed' ? '#256029' : '#c62828', borderRadius: 6, padding: '2px 12px', fontWeight: 700, fontSize: 14 }}>
                    {booking.status.toUpperCase()}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Booking Details</div>
                  <div><b>Out Date:</b> {booking.out_date}</div>
                  <div><b>Out Time:</b> {booking.out_time}</div>
                  <div><b>In Date:</b> {booking.in_date}</div>
                  <div><b>In Time:</b> {booking.in_time}</div>
                  <div><b>Reason:</b> {booking.reason}</div>
                  <div><b>Status:</b> {booking.status}</div>
                  {booking.status === 'rejected' && booking.rejection_reason && (
                    <div style={{ color: '#c62828', fontWeight: 600, marginTop: 8 }}>
                      <b>Rejection Reason:</b> {booking.rejection_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
    </div>
  );
};

export default SlotBooking;