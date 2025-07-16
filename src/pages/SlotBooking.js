import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  fetchAvailableSeats, 
  bookSlot, 
  fetchBookedSlots, 
  deleteBookedSlot, 
  checkApiHealth,
  fetchPendingBookings,
  handleBookingAction,
  fetchDayOrder,
  fetchStudentInfoByEmail,
  fetchAdminInfoByEmail
} from '../services/api';
import './SlotBooking.css';
import { supabase } from '../supabaseClient';
import TimeSlots from '../components/TimeSlots';

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
  const [timeSlots, setTimeSlots] = useState([]);
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

  // Handle booking form input changes
  const handleBookingChange = async (e) => {
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
        setTimeSlots([]);
        setSelectedSlots([]);
        return;
      }

      setBookingForm(prev => ({
        ...prev,
        date: value,
        lab: '',  // Reset lab selection when date changes
        timeSlots: []  // Reset time slots when date changes
      }));
      setTimeSlots([]); // Clear time slots
      setSelectedSlots([]); // Clear selected slots when date changes
    } else {
      // Update form state for other fields
      setBookingForm(prev => {
        const updatedForm = {
          ...prev,
          [name]: value
        };

        // If changing day order, reset lab and time slots
        if (name === 'dayOrder') {
          updatedForm.lab = '';
          updatedForm.timeSlots = [];
          setTimeSlots([]);
          setSelectedSlots([]);
        }

        // Handle lab selection or day order changes
        if ((name === 'lab' || name === 'dayOrder') && updatedForm.date) {
          // Only fetch available seats if we have both lab and day order
          if (updatedForm.lab && updatedForm.dayOrder) {
            handleFetchAvailableSeats(updatedForm.date, updatedForm.lab);
          }
        }

        return updatedForm;
      });
    }
  };

  // Retry server connection
  const handleRetryConnection = async () => {
    setLoading(true);
    // This now checks Supabase connection health
    const isHealthy = await checkApiHealth();
    setApiError(!isHealthy);
    setLoading(false);
    
    if (isHealthy && bookingForm.date && bookingForm.lab && bookingForm.dayOrder) {
      handleFetchAvailableSeats(bookingForm.date, bookingForm.lab);
    }
  };

  // Fetch available seats for selected date and lab
  const handleFetchAvailableSeats = async (selectedDate, selectedLab) => {
    if (!selectedDate || !selectedLab || !bookingForm.dayOrder) {
      setTimeSlots([]);
      setSelectedSlots([]);
      return;
    }

    setLoading(true);
    // Store current error message and selected slots
    const currentError = error;
    setApiError(false);
    
    try {
      const response = await fetchAvailableSeats(selectedDate, selectedLab, bookingForm.dayOrder);
      console.log('Available slots response:', response);
      
      if (response && response.availableSlots) {
        // Transform the data for the UI
        const availableTimeSlots = response.availableSlots.map(slot => ({
          value: slot.time_slot,
          label: formatTimeSlotForDisplay(slot.time_slot),
          available: slot.available
        }));
        
        // Update time slots
        setTimeSlots(availableTimeSlots);
        
        // Remove any selected slots that are no longer available
        setSelectedSlots(prevSlots => 
          prevSlots.filter(slot => 
            availableTimeSlots.find(ts => ts.value === slot && ts.available)
          )
        );
      } else {
        setTimeSlots([]);
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

  const handleSlotSelect = (slot) => {
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
  };

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

  const handleStatusFilter = (status) => {
    setSelectedStatus(status);
    // We don't need to refetch - just filter the existing bookings
    if (bookedSlots && bookedSlots.length > 0) {
      // The filtering is now handled in the UI by the component
      // We just need to update the selected status
    }
  };

  return (
    <div className="slot-booking-container">
      <h2>Request Outing</h2>
      
      {(!isAdmin && !studentInfoExists) && (
        <div className="alert alert-warning" style={{margin:'20px auto',maxWidth:500,padding:16,background:'#fff3cd',border:'1px solid #ffeeba',borderRadius:8,color:'#856404',fontSize:'1em',textAlign:'center'}}>
          Please contact your warden to add your details. You cannot fill in this information yourself.
        </div>
      )}
      
      <form onSubmit={handleBookingSubmit} className="booking-form">
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
          {loading && timeSlots.length === 0 ? (
            <div>Loading available slots...</div>
          ) : timeSlots.length > 0 ? (
            timeSlots.map(slot => (
              <div
                key={slot.value}
                className={`time-slot-item ${!slot.available ? 'disabled' : ''} ${selectedSlots.includes(slot.value) ? 'selected' : ''}`}
                onClick={() => slot.available && handleSlotSelect(slot.value)}
                style={{ cursor: slot.available ? 'pointer' : 'not-allowed' }}
              >
                <div className="time-slot-time">{slot.label}</div>
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

      {bookedSlots.length > 0 && (
        <div className="booked-slots-section">
          <h2>Your Requests</h2>
          
          <div className="status-filter-buttons">
            <button
              className={`status-button ${selectedStatus === 'all' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('all')}
            >
              All Requests ({bookingCounts.waiting + bookingCounts.confirmed + bookingCounts.rejected})
            </button>
            <button
              className={`status-button ${selectedStatus === 'waiting' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('waiting')}
            >
              Waiting ({bookingCounts.waiting})
            </button>
            <button
              className={`status-button ${selectedStatus === 'confirmed' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('confirmed')}
            >
              Confirmed ({bookingCounts.confirmed})
            </button>
            <button
              className={`status-button ${selectedStatus === 'rejected' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('rejected')}
            >
              Rejected ({bookingCounts.rejected})
            </button>
            <button
              className={`status-button ${selectedStatus === 'otp' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('otp')}
            >
              OTP
            </button>
          </div>

          {selectedStatus === 'otp' ? (
            <div className="booked-slots-list">
              {(() => {
                const otpBookings = bookedSlots
                  .filter(booking => booking.status === 'confirmed' && booking.otp)
                  .sort((a, b) => new Date(b.created_at || b.out_date || b.in_date) - new Date(a.created_at || a.out_date || a.in_date));
                if (otpBookings.length === 0) {
                  return <div className="no-bookings">No OTPs available.</div>;
                }
                const latest = otpBookings[0];
                return (
                  <div key={latest.id} className={`booking-card otp-card`}>
                    <div className="booking-status-badge">OTP</div>
                    <div className="booking-info">
                      <h3>Booking Details</h3>
                      <p><strong>Out Date:</strong> {latest.out_date}</p>
                      <p><strong>Out Time:</strong> {latest.out_time}</p>
                      <p><strong>In Date:</strong> {latest.in_date}</p>
                      <p><strong>In Time:</strong> {latest.in_time}</p>
                      <div className="otp-section" style={{marginTop:12,padding:12,background:'#f9fbe7',border:'1px solid #cddc39',borderRadius:8}}>
                        {latest.otp_used ? (
                          <span style={{color:'#f44336',fontWeight:'bold'}}>OTP Used</span>
                        ) : (
                          <>
                            <strong>OTP for Arch Gate:</strong> <span style={{fontSize:'1.2em',letterSpacing:2}}>{latest.otp}</span>
                            <div style={{fontSize:'0.9em',color:'#888',marginTop:4}}>
                              (Show this OTP at the Arch Gate. Valid for 30 minutes or until submitted.)
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            bookedSlots.length > 0 ? (
              <div className="booked-slots-list">
                {bookedSlots
                  .filter(booking => selectedStatus === 'all' || booking.status === selectedStatus)
                  .map((booking) => (
                    <div key={booking.id} className={`booking-card ${booking.status}`}>
                      <div className="booking-status-badge">{booking.status}</div>
                      <div className="booking-info">
                        <h3>Booking Details</h3>
                        <p><strong>Out Date:</strong> {booking.out_date}</p>
                        <p><strong>Out Time:</strong> {booking.out_time}</p>
                        <p><strong>In Date:</strong> {booking.in_date}</p>
                        <p><strong>In Time:</strong> {booking.in_time}</p>
                        <p><strong>Status:</strong> {booking.status}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="no-bookings">
                {selectedStatus === 'all' 
                  ? 'You have no bookings yet'
                  : `You have no ${selectedStatus} bookings`}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default SlotBooking;