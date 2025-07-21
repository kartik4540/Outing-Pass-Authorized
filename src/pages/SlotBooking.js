import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  fetchAvailableSeats, 
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

const SlotBooking = () => {
  // Form state
  const [bookingForm, setBookingForm] = useState({
    name: '',
    email: '',
    department: '',
    outDate: '',
    outTime: '',
    inDate: '',
    inTime: '',
    parentEmail: '',
    parentPhone: ''
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [apiError, setApiError] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState([]); // Changed from selectedSlot to selectedSlots array
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [bookingCounts, setBookingCounts] = useState({ waiting: 0, confirmed: 0, rejected: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [studentInfoExists, setStudentInfoExists] = useState(true); // Assume true by default
  const [banInfo, setBanInfo] = useState(null); // store ban info if banned
  const [blockBooking, setBlockBooking] = useState(false);
  const [waitingBooking, setWaitingBooking] = useState(null);

  // Check API health and initialize user on component mount
  useEffect(() => {
    const checkServerHealth = async () => {
      const isHealthy = await checkApiHealth();
      setApiError(!isHealthy);
    };
    
    const initializeUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          let name = user.user_metadata?.full_name || user.email;
          let email = user.email;
          let department = '';
          let parentEmail = '';
          let parentPhone = '';
          // Check if user is admin
          let adminInfo = null;
          try {
            adminInfo = await fetchAdminInfoByEmail(email);
            setIsAdmin(!!adminInfo);
          } catch (e) {
            setIsAdmin(false);
          }
          // Try to fetch student info from admin table
          let info = null;
          try {
            info = await fetchStudentInfoByEmail(email);
            if (info) {
              department = info.hostel_name;
              parentEmail = info.parent_email || '';
              parentPhone = info.parent_phone || '';
              setStudentInfoExists(true);
            } else {
              setStudentInfoExists(false);
            }
          } catch (e) {
            setStudentInfoExists(false);
          }
          setBookingForm(prev => ({
            ...prev,
            email,
            name,
            department,
            parentEmail,
            parentPhone
          }));
          // Ban check and auto-unban
          const ban = await checkAndAutoUnban(email);
          setBanInfo(ban);
          if (user.email) {
            await fetchUserBookings(user.email);
          }
        }
      } catch (error) {
        console.error('Error initializing user:', error);
      }
    };
    
    checkServerHealth();
    initializeUser();
    
    // Set the minimum date to today
    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("date");
    if (dateInput) {
      dateInput.setAttribute("min", today);
    }
  }, []);

  // Block booking if ANY booking is waiting or still_out
  useEffect(() => {
    const block = (bookedSlots || []).some(b => b.status === 'waiting' || b.status === 'still_out');
    setBlockBooking(block);
  }, [bookedSlots]);

  // Handle booking form input changes
  const handleBookingChange = useCallback(async (e) => {
    const { name, value } = e.target;
    
    // Prevent only email from being changed
    if (name === 'email') {
      return;
    }
    
    // Clear previous messages
    setError('');
    setSuccess('');

    // Handle date changes with weekend validation
    if (name === 'date' && value) {
      if (isDateDisabled(value)) {
        const nextAvailableDate = getNextAvailableDate(value);
        setError('Weekends are not available for booking. Next available date selected.');
        
        // Update the date input to the next available date
        e.target.value = nextAvailableDate;
        
        setBookingForm(prev => ({
          ...prev,
          date: nextAvailableDate,
          lab: '',
          timeSlots: []
        }));
        setSelectedSlots([]);
        return;
      }

      setBookingForm(prev => ({
        ...prev,
        date: value,
        lab: '',  // Reset lab selection when date changes
        timeSlots: []  // Reset time slots when date changes
      }));
      setSelectedSlots([]); // Clear selected slots when date changes
    } else {
      // Update form state for other fields
      setBookingForm(prev => {
        const updatedForm = {
          ...prev,
          [name]: value
        };

        // Handle lab selection or day order changes
        if ((name === 'lab') && updatedForm.date) {
          // Only fetch available seats if we have both lab and day order
          if (updatedForm.lab) {
            handleFetchAvailableSeats(updatedForm.date, updatedForm.lab);
          }
        }

        return updatedForm;
      });
    }
  }, []);

  // Retry server connection
  const handleRetryConnection = async () => {
    setLoading(true);
    // This now checks Supabase connection health
    const isHealthy = await checkApiHealth();
    setApiError(!isHealthy);
    setLoading(false);
    
    if (isHealthy && bookingForm.date && bookingForm.lab) {
      handleFetchAvailableSeats(bookingForm.date, bookingForm.lab);
    }
  };

  // Fetch available seats for selected date and lab
  const handleFetchAvailableSeats = async (selectedDate, selectedLab) => {
    if (!selectedDate || !selectedLab) {
      setSelectedSlots([]);
      return;
    }

    setLoading(true);
    // Store current error message and selected slots
    const currentError = error;
    setApiError(false);
    
    try {
      const response = await fetchAvailableSeats(selectedDate, selectedLab);
      console.log('Available slots response:', response);
      
      if (response && response.availableSlots) {
        // Transform the data for the UI
        const availableTimeSlots = response.availableSlots.map(slot => ({
          value: slot.time_slot,
          label: formatTimeSlotForDisplay(slot.time_slot),
          available: slot.available
        }));
        
        // Update time slots
        setSelectedSlots(availableTimeSlots.map(slot => slot.value));
      } else {
        setSelectedSlots([]);
        setError('No time slot data available. Please try again.');
      }

      // Restore error message if it exists
      if (currentError) {
        setError(currentError);
      }
    } catch (error) {
      console.error('Error fetching available seats:', error);
      if (error.message && error.message.includes('Supabase request')) {
        setApiError(true);
      } else {
        setError(error.message || 'Failed to fetch available time slots. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Helper to format time slot for display
  const formatTimeSlotForDisplay = (timeSlot) => {
    const [start, end] = timeSlot.split('-');
    // Convert 24-hour format to AM/PM
    const formatTime = (time) => {
      let [hours, minutes] = time.split(':');
      const hoursNum = parseInt(hours);
      const period = hoursNum >= 12 ? 'PM' : 'AM';
      const displayHours = hoursNum > 12 ? hoursNum - 12 : hoursNum;
      return `${displayHours}:${minutes} ${period}`;
    };
    
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  // Handle booking form submission
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Failsafe: Block if any booking is waiting or still_out
    if ((bookedSlots || []).some(b => b.status === 'waiting' || b.status === 'still_out')) {
      setError('You already have a pending or active outing request. Please complete or delete it before making a new one.');
      setLoading(false);
      return;
    }

    try {
      // Validate required fields
      if (!bookingForm.name || !bookingForm.email || !bookingForm.department || !bookingForm.outDate || !bookingForm.outTime || !bookingForm.inDate || !bookingForm.inTime || !bookingForm.parentEmail) {
        setError('Please fill all required fields.');
        setLoading(false);
        return;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(bookingForm.parentEmail)) {
        setError('Please enter a valid parent email address.');
        setLoading(false);
        return;
      }

      // Map department to hostelName for API
      const bookingData = {
        name: bookingForm.name,
        email: bookingForm.email,
        hostelName: bookingForm.department, // map department to hostelName
        outDate: bookingForm.outDate,
        outTime: bookingForm.outTime,
        inDate: bookingForm.inDate,
        inTime: bookingForm.inTime,
        parentEmail: bookingForm.parentEmail,
        parentPhone: bookingForm.parentPhone, // Ensure parentPhone is included
        status: 'waiting' // Ensure status is set
      };

      // Log the data being sent
      console.log('Booking data sent:', bookingData);

      // Make the booking request
      const response = await bookSlot(bookingData);

      if (response.success) {
        setSuccess('Request submitted successfully!');
        // Clear form
        setBookingForm({
          name: '',
          email: bookingForm.email, // keep email if needed
          department: '',
          outDate: '',
          outTime: '',
          inDate: '',
          inTime: '',
          parentEmail: '',
          parentPhone: ''
        });
        // Fetch latest bookings
        await fetchUserBookings(bookingForm.email);
      } else {
        setError(response.error || 'Failed to create booking. Please try again.');
      }
    } catch (error) {
      console.error('Booking error:', error);
      setError(error.message || 'Failed to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch booked slots for a user
  const fetchUserBookings = async (email) => {
    try {
      setLoading(true);
      const bookingsData = await fetchBookedSlots(email);
      
      // Update bookings
      setBookedSlots(bookingsData || []);
      
      // Update counts if available
      if (bookingsData && bookingsData.counts) {
        setBookingCounts(bookingsData.counts);
      }
      
      // Clear any existing error
      setError('');
    } catch (error) {
      console.error('Error fetching user bookings:', error);
      // Don't set error if it's just that there are no bookings yet
      if (error.message !== 'No bookings found') {
        setError('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSlotSelect = useCallback((slot) => {
    setSelectedSlots(prevSlots => {
      const newSlots = prevSlots.includes(slot)
        ? prevSlots.filter(s => s !== slot)  // Remove slot if already selected
        : [...prevSlots, slot];              // Add slot if not selected
      
      // Update bookingForm.timeSlots as well
      setBookingForm(prev => ({
        ...prev,
        timeSlots: newSlots
      }));
      
      return newSlots;
    });
    setError('');
    setSuccess('');
  }, []);

  // Function to check if a date is a weekend
  const isWeekend = (date) => {
    const day = new Date(date).getDay();
    // 0 is Sunday, 6 is Saturday
    return day === 0 || day === 6;
  };

  // Function to check if a date should be disabled (weekends)
  const isDateDisabled = (date) => {
    const currentDate = new Date(date);
    return currentDate.getDay() === 0 || currentDate.getDay() === 6; // 0 is Sunday, 6 is Saturday
  };
      
  // Function to get the next available date (skip weekends)
  const getNextAvailableDate = (date) => {
    const currentDate = new Date(date);
    while (isDateDisabled(currentDate)) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return currentDate.toISOString().split('T')[0];
  };

  const handleStatusFilter = useCallback((status) => {
    setSelectedStatus(status);
    // We don't need to refetch - just filter the existing bookings
    if (bookedSlots && bookedSlots.length > 0) {
      // The filtering is now handled in the UI by the component
      // We just need to update the selected status
    }
  }, [bookedSlots]);

  const handleDeleteBooking = useCallback(async (bookingId) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await deleteBookedSlot(bookingId);
      setSuccess('Booking deleted successfully. You can now make a new request.');
      await fetchUserBookings(bookingForm.email);
    } catch (err) {
      setError(err.message || 'Failed to delete booking');
    } finally {
      setLoading(false);
    }
  }, [bookingForm.email]);

  const handleDeleteWaiting = useCallback(async () => {
    if (!waitingBooking) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await deleteBookedSlot(waitingBooking.id);
      setSuccess('Booking deleted successfully. You can now make a new request.');
      await fetchUserBookings(bookingForm.email);
    } catch (err) {
      setError(err.message || 'Failed to delete booking');
    } finally {
      setLoading(false);
    }
  }, [waitingBooking, bookingForm.email]);

  // Find latest still_out/confirmed booking with OTP
  const latestOtpBooking = useMemo(() =>
    (bookedSlots || [])
      .filter(b => (b.status === 'still_out' || b.status === 'confirmed') && b.otp)
      .sort((a, b) => new Date(b.created_at || b.out_date || b.in_date) - new Date(a.created_at || a.out_date || a.in_date))[0]
  , [bookedSlots]);

  // Find the current (waiting or still_out) booking
  const currentBooking = useMemo(() =>
    (bookedSlots || [])
      .filter(b => b.status === 'waiting' || b.status === 'still_out')
      .sort((a, b) => new Date(b.created_at || b.out_date || b.in_date) - new Date(a.created_at || a.out_date || a.in_date))[0]
  , [bookedSlots]);

  // Find all old confirmed bookings
  const oldConfirmedBookings = useMemo(() =>
    (bookedSlots || [])
      .filter(b => b.status === 'confirmed')
  , [bookedSlots]);

  // Add handler factories at the top of the component
  const handleDeleteBookingFactory = useCallback((id) => () => handleDeleteBooking(id), [handleDeleteBooking]);
  const handleSlotSelectFactory = useCallback((slot) => () => handleSlotSelect(slot), [handleSlotSelect]);

  return (
    <div className="slot-booking-container">
      <h2>Request Outing</h2>
      
      {banInfo && (
        <div style={{ color: 'red', fontWeight: 600, marginBottom: 24, fontSize: 18 }}>
          You are banned from making outing requests until {banInfo.till_date}.
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

        <div className="time-slots-grid">
          {loading && selectedSlots.length === 0 ? (
            <div>Loading available slots...</div>
          ) : selectedSlots.length > 0 ? (
            selectedSlots.map(slot => (
              <div
                key={slot}
                className={`time-slot-item ${!slot.available ? 'disabled' : ''} ${selectedSlots.includes(slot) ? 'selected' : ''}`}
                onClick={slot.available ? handleSlotSelectFactory(slot) : undefined}
                style={{ cursor: slot.available ? 'pointer' : 'not-allowed' }}
              >
                <div className="time-slot-time">{formatTimeSlotForDisplay(slot)}</div>
                <div className="time-slot-status" style={{ 
                  color: slot.available ? '#4caf50' : '#f44336',
                  fontWeight: '500'
                }}>
                  {slot.available ? 'Available' : 'Not Available'}
                </div>
              </div>
            ))
          ) : (
            null
          )}
        </div>

        <div className="button-container">
          <button 
            type="submit"
            className="booking-button"
            disabled={(!isAdmin && !studentInfoExists) || loading || apiError ||
              !bookingForm.name ||
              !bookingForm.email ||
              !bookingForm.department ||
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
      
      {message && (
        <div className={`message ${message.includes('Error') || message.includes('Please') ? 'error' : 'success'}`}>
          {message}
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
                <div><b>Status:</b> {currentBooking.status}</div>
                {currentBooking.status === 'waiting' && (
                  <button onClick={handleDeleteBookingFactory(currentBooking.id)} disabled={loading} style={{ marginTop: 16, background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, cursor: 'pointer' }}>
                    {loading ? 'Deleting...' : 'Delete'}
            </button>
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
        {oldConfirmedBookings.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ textAlign: 'left', marginBottom: 12 }}>Past Confirmed Outings</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {oldConfirmedBookings.map(booking => (
                <div key={booking.id} style={{ border: '2px solid #4caf50', borderRadius: 12, padding: 20, background: '#fff', boxShadow: '0 2px 8px #0001', position: 'relative', marginBottom: 0, minWidth: 280 }}>
                  <div style={{ position: 'absolute', top: 12, right: 12, background: '#c8e6c9', color: '#256029', borderRadius: 6, padding: '2px 12px', fontWeight: 700, fontSize: 14 }}>CONFIRMED</div>
                  <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Booking Details</div>
                  <div><b>Out Date:</b> {booking.out_date}</div>
                  <div><b>Out Time:</b> {booking.out_time}</div>
                  <div><b>In Date:</b> {booking.in_date}</div>
                  <div><b>In Time:</b> {booking.in_time}</div>
                  <div><b>Status:</b> {booking.status}</div>
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