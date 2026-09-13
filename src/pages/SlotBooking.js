import React, { useEffect, useMemo, useCallback, useReducer } from 'react';
import { 
  bookSlot, 
  fetchBookedSlots, 
  deleteBookedSlot, 
  checkApiHealth,
  fetchStudentInfoByEmail,
  fetchAdminInfoByEmail,
  checkAndAutoUnban,
  generateOtpForBooking
} from '../services/api';
import './SlotBooking.css';
import { supabase } from '../supabaseClient';
const initialState = {
  bookingForm: {
    name: '',
    email: '',
    roomNumber: '',
    hostelName: '',
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
      return { 
        ...state, 
        user: action.payload.user, 
        bookingForm: { 
          ...state.bookingForm, 
          ...action.payload.formDetails,
          hostelName: action.payload.studentInfo?.hostel_name || '' // Empty if no student info
        } 
      };
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
      const cacheKey = `user_bookings_${email}`;
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          if (cached && Date.now() - cached.ts < 2 * 60 * 1000) {
            dispatch({ 
              type: 'SET_BOOKINGS', 
              payload: {
                bookings: cached.rows || [],
                counts: cached.rows?.counts || { waiting: 0, confirmed: 0, rejected: 0 }
              }
            });
          }
        } catch {}
      }
      const bookingsData = await fetchBookedSlots(email, { limit: 50, minimal: true });
      dispatch({ 
        type: 'SET_BOOKINGS', 
        payload: {
          bookings: bookingsData || [],
          counts: bookingsData?.counts || { waiting: 0, confirmed: 0, rejected: 0 }
        }
      });
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), rows: bookingsData })); } catch {}
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
          let parentEmail = '';
          let parentPhone = '';
          const adminInfo = await fetchAdminInfoByEmail(email);
          dispatch({ type: 'SET_FIELD', field: 'isAdmin', value: !!adminInfo });
          const info = await fetchStudentInfoByEmail(email);
          if (info) {
            parentEmail = info.parent_email || '';
            parentPhone = info.parent_phone || '';
            dispatch({ type: 'SET_FIELD', field: 'studentInfoExists', value: true });
            dispatch({ 
              type: 'SET_USER_INFO', 
              payload: { 
                user, 
                studentInfo: info, // Pass the student info object
                formDetails: { email, name, parentEmail, parentPhone } 
              }
            });
          } else {
            // Student not found in student_info - not allowed to use the app
            dispatch({ type: 'SET_FIELD', field: 'studentInfoExists', value: false });
            dispatch({ type: 'SET_ERROR', payload: 'Student information not found. Please contact administration to add your details.' });
            dispatch({ 
              type: 'SET_USER_INFO', 
              payload: { 
                user, 
                studentInfo: null, // No student info
                formDetails: { email, name, parentEmail: '', parentPhone: '' } 
              }
            });
          }
          const ban = await checkAndAutoUnban(email);
          dispatch({ type: 'SET_FIELD', field: 'banInfo', value: ban });
          if (user.email) {
            await fetchUserBookings(user.email);
          }
        }
      } catch (error) {
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
    if (name === 'outDate' || name === 'outTime' || name === 'inDate' || name === 'inTime') {
      const currentForm = { ...bookingForm, [name]: value };
      if (currentForm.outDate && currentForm.outTime && currentForm.inDate && currentForm.inTime) {
        try {
          const outDateTime = new Date(`${currentForm.outDate}T${currentForm.outTime}`);
          const inDateTime = new Date(`${currentForm.inDate}T${currentForm.inTime}`);
          if (inDateTime <= outDateTime) {
            dispatch({ type: 'SET_ERROR', payload: 'In date and time must be after out date and time.' });
          }
        } catch (error) {
        }
      }
    }
  }, [bookingForm]);
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
      // Check if student info exists
      if (!studentInfoExists) {
        throw new Error('Student information not found. Please contact administration to add your details.');
      }
      if (!bookingForm.name || !bookingForm.email || !bookingForm.roomNumber || !bookingForm.hostelName || !bookingForm.outDate || !bookingForm.outTime || !bookingForm.inDate || !bookingForm.inTime || !bookingForm.parentEmail) {
        throw new Error('Please fill all required fields.');
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(bookingForm.parentEmail)) {
        throw new Error('Please enter a valid parent email address.');
      }
      // Date and time validation
      const outDateTime = new Date(`${bookingForm.outDate}T${bookingForm.outTime}`);
      const inDateTime = new Date(`${bookingForm.inDate}T${bookingForm.inTime}`);
      const now = new Date();
      // Check if out date is not in the past
      if (outDateTime < now) {
        throw new Error('Out date and time cannot be in the past.');
      }
      // Check if in date is not before out date
      if (inDateTime < outDateTime) {
        throw new Error('In date and time must be after out date and time.');
      }
      // No duration limit - students can request outing for any duration
      const bookingData = {
        name: bookingForm.name,
        email: bookingForm.email,
        hostelName: bookingForm.hostelName,
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
  const hasValidTimes = useMemo(() => {
    if (!bookingForm.outDate || !bookingForm.outTime || !bookingForm.inDate || !bookingForm.inTime) {
      return true; // Don't show error if fields are empty
    }
    try {
      const outDateTime = new Date(`${bookingForm.outDate}T${bookingForm.outTime}`);
      const inDateTime = new Date(`${bookingForm.inDate}T${bookingForm.inTime}`);
      return inDateTime > outDateTime;
    } catch {
      return true; // Don't show error if dates are invalid
    }
  }, [bookingForm.outDate, bookingForm.outTime, bookingForm.inDate, bookingForm.inTime]);
  const handleGenerateOtp = useCallback(async (bookingId) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: '' });
    dispatch({ type: 'SET_SUCCESS', payload: '' });
    try {
      const result = await generateOtpForBooking(bookingId);
      dispatch({ type: 'SET_SUCCESS', payload: `OTP generated successfully: ${result.otp}` });
      await fetchUserBookings(bookingForm.email);
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Failed to generate OTP' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [bookingForm.email, fetchUserBookings]);
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
        <label htmlFor="hostelName">Hostel Name:</label>
          <input
            type="text"
            id="hostelName"
            name="hostelName"
            value={bookingForm.hostelName}
            readOnly
            disabled
            className="readonly-input"
            required
            placeholder="Hostel name from student info"
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
            style={{
              borderColor: !hasValidTimes ? '#dc3545' : undefined,
              backgroundColor: !hasValidTimes ? '#fff5f5' : undefined
            }}
          />
          {!hasValidTimes && bookingForm.outDate && bookingForm.outTime && bookingForm.inDate && bookingForm.inTime && (
            <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
              ⚠️ In time must be after out time
            </div>
          )}
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
              !bookingForm.roomNumber ||
              !bookingForm.hostelName ||
              !bookingForm.outDate ||
              !bookingForm.outTime ||
              !bookingForm.inDate ||
              !bookingForm.inTime ||
              !bookingForm.parentEmail ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookingForm.parentEmail) ||
              !hasValidTimes
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
              <div className="current-booking-card" style={{ border: '2px solid #ffc107', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px #0001', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <div style={{ position: 'absolute', top: 12, right: 12, background: '#ffe082', color: '#856404', borderRadius: 6, padding: '2px 12px', fontWeight: 700, fontSize: 14 }}>{currentBooking.status.toUpperCase()}</div>
                <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Current Request</div>
                <div><b>Out Date:</b> {currentBooking.out_date}</div>
                <div><b>Out Time:</b> {currentBooking.out_time}</div>
                <div><b>In Date:</b> {currentBooking.in_date}</div>
                <div><b>In Time:</b> {currentBooking.in_time}</div>
                <div><b>Reason:</b> {currentBooking.reason}</div>
                <div><b>Status:</b> {currentBooking.status}</div>
                {currentBooking.handled_by && currentBooking.status !== 'waiting' && (
                  <div className="handled-section">
                    <div><b>Handled on:</b> {currentBooking.handled_at ? new Date(currentBooking.handled_at).toLocaleString() : ''}</div>
                    <div><b>Handled by:</b> {currentBooking.handled_by}</div>
                  </div>
                )}
                {currentBooking.status === 'waiting' && (
                  <button onClick={handleDeleteBookingFactory(currentBooking.id)} disabled={loading} style={{ marginTop: 16, background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, cursor: 'pointer' }}>
                    {loading ? 'Deleting...' : 'Delete'}
                  </button>
                )}
                {currentBooking.status === 'still_out' && !currentBooking.otp && (
                  <button 
                    onClick={() => handleGenerateOtp(currentBooking.id)} 
                    disabled={loading} 
                    style={{ 
                      marginTop: 16, 
                      background: '#28a745', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 4, 
                      padding: '8px 20px', 
                      fontWeight: 500, 
                      cursor: 'pointer' 
                    }}
                  >
                    {loading ? 'Generating...' : 'Generate OTP'}
                  </button>
                )}
                {currentBooking && currentBooking.status === 'rejected' && currentBooking.rejection_reason && (
                  <div style={{ color: '#c62828', fontWeight: 600, margin: '12px 0' }}>
                    <b>Rejection Reason:</b> {currentBooking.rejection_reason}
                  </div>
                )}
          </div>
            ) : (
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
                <div key={booking.id} className="past-booking-card" style={{ border: booking.status === 'confirmed' ? '2px solid #4caf50' : '2px solid #e57373', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px #0001', position: 'relative', marginBottom: 0, minWidth: 280 }}>
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
                  {booking.handled_by && booking.status !== 'waiting' && (
                    <div className="handled-section">
                      <div><b>Handled on:</b> {booking.handled_at ? new Date(booking.handled_at).toLocaleString() : ''}</div>
                      <div><b>Handled by:</b> {booking.handled_by}</div>
                    </div>
                  )}
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
      {/* Footer: Created by and SRM links */}
      <footer
        style={{
          margin: '32px auto 0 auto',
          maxWidth: 420,
          background: '#fafbfc',
          borderTop: '1px solid #e0e0e0',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 13,
          color: '#888',
          textAlign: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          width: '100%',
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 500 }}>Created by:</span> Kartik Mittal (<a href="mailto:km5260@srmist.edu.in" style={{ color: '#1976d2', textDecoration: 'none' }}>km5260@srmist.edu.in</a>)<br />
          <span style={{ fontWeight: 500 }}>Co-developer:</span> Reetam Kole (<a href="mailto:rk0598@srmist.edu.in" style={{ color: '#1976d2', textDecoration: 'none' }}>rk0598@srmist.edu.in</a>)<br />
          <span style={{ fontWeight: 500 }}>Maintained by:</span><br />
          Yatin Annam (<a href="mailto:ya8476@srmist.edu.in" style={{ color: '#1976d2', textDecoration: 'none' }}>ya8476@srmist.edu.in</a>)<br />
          Viva Baranwal (<a href="mailto:vb1680@srmist.edu.in" style={{ color: '#1976d2', textDecoration: 'none' }}>vb1680@srmist.edu.in</a>)<br />
          Krishanth R J (<a href="mailto:kr3976@srmist.edu.in" style={{ color: '#1976d2', textDecoration: 'none' }}>kr3976@srmist.edu.in</a>)
        </div>
        <div style={{ marginTop: 4 }}>
          <span style={{ fontWeight: 500 }}>Other SRM links:</span>
          <ul style={{ margin: '6px 0 0 0', padding: 0, listStyle: 'none' }}>
            <li style={{ margin: 0 }}><a href="https://sp.srmist.edu.in/srmiststudentportal/students/loginManager/youLogin.jsp" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'underline' }}>Student Portal</a></li>
            <li style={{ margin: 0 }}><a href="https://academia.srmist.edu.in/" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'underline' }}>Academia</a></li>
            <li style={{ margin: 0 }}><a href="https://www.srmist.edu.in/srm-hostels/" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'underline' }}>SRM Hostels</a></li>
          </ul>
        </div>
      </footer>
    </div>
  );
};
export default SlotBooking;
