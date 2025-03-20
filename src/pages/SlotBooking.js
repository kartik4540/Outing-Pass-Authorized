import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  fetchAvailableSeats, 
  bookSlot, 
  fetchBookedSlots, 
  deleteBookedSlot, 
  checkApiHealth,
  fetchPendingBookings,
  handleBookingAction,
  fetchDayOrder
} from '../services/api';
import './SlotBooking.css';
import { supabase } from '../supabaseClient';
import TimeSlots from '../components/TimeSlots';

const SlotBooking = () => {
  // Form state
  const [bookingForm, setBookingForm] = useState({
    facultyId: '',
    name: '',
    email: '',
    department: '',
    date: '',
    dayOrder: '',
    lab: '',
    timeSlots: [] // Changed from timeSlot to timeSlots array
  });

  // UI state
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [showBookedSlots, setShowBookedSlots] = useState(true); // Set to true by default
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [apiError, setApiError] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlots, setSelectedSlots] = useState([]); // Changed from selectedSlot to selectedSlots array
  const [message, setMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [user, setUser] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [bookingCounts, setBookingCounts] = useState({ waiting: 0, confirmed: 0, rejected: 0 });

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
          const userIsAdmin = isAdminUser(user.email);
          setIsAdmin(userIsAdmin);
          
          setBookingForm(prev => ({
            ...prev,
            email: user.email,
            name: user.user_metadata?.full_name || user.email
          }));

          if (user.email) {
            await fetchUserBookings(user.email);
            if (userIsAdmin) {
              await fetchPendingBookingsData();
            }
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
  
  // Function to check if a user is admin
  const isAdminUser = (email) => {
    const adminEmails = ['km5260@srmist.edu.in'];
    return adminEmails.includes(email);
  };

  // Utility function to check if a date is a weekend
  const isWeekend = (date) => {
    const day = new Date(date).getDay();
    // 0 is Sunday, 6 is Saturday
    return day === 0 || day === 6;
  };
  
  // Function to provide a descriptive date string
  const formatDateForDisplay = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDay();
    const isWeekendDay = day === 0 || day === 6;
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    return `${formattedDate}${isWeekendDay ? ' (Weekend - Not Available)' : ''}`;
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
      if (!bookingForm.date || !bookingForm.lab || !bookingForm.timeSlots || bookingForm.timeSlots.length === 0) {
        setError('Please select a date, lab, and at least one time slot.');
        return;
      }

      // Create booking data
      const bookingData = {
        ...bookingForm,
        timeSlots: bookingForm.timeSlots // Ensure timeSlots is an array
      };

      // Make the booking request
      const response = await bookSlot(bookingData);

      if (response.success) {
        setSuccess('Booking request submitted successfully!');
        // Clear form
        setBookingForm(prev => ({
          ...prev,
          date: '',
          lab: '',
          timeSlots: []
        }));
        setSelectedSlots([]);
        setTimeSlots([]);
        
        // Refresh booked slots
        if (user?.email) {
          await fetchUserBookings(user.email);
        }
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
      setBookedSlots(bookingsData);
      
      // Update counts if available
      if (bookingsData.counts) {
        setBookingCounts(bookingsData.counts);
      }
      
      setError('');
    } catch (error) {
      console.error('Error fetching user bookings:', error);
      setError('Failed to fetch your bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Delete a booked slot
  const handleDeleteBookedSlot = async (bookingId) => {
    if (!window.confirm("Are you sure you want to delete this slot?")) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const data = await deleteBookedSlot(bookingId);
      setSuccess(data.message);
      
      // Refresh the booked slots using the email from the form
      if (bookingForm.email) {
        fetchUserBookings(bookingForm.email);
      }
      
      // Fetch available seats again to update the slots
      if (bookingForm.date && bookingForm.lab) {
        handleFetchAvailableSeats(bookingForm.date, bookingForm.lab);
      }
      
    } catch (error) {
      console.error('Error deleting slot:', error);
      if (error.message && error.message.includes('Supabase request')) {
        setApiError(true);
      } else {
        setError(error.message || 'Failed to delete booking. Please try again later.');
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

  // Function to fetch pending bookings (admin only)
  const fetchPendingBookingsData = async () => {
    try {
      setLoading(true);
      const pendingBookings = await fetchPendingBookings(user.email);
      setPendingBookings(pendingBookings);
    } catch (error) {
      console.error('Error fetching pending bookings:', error);
      setError('Failed to fetch pending bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Function to handle booking status change (confirm/reject)
  const handleBookingStatusChange = async (bookingId, action) => {
    try {
      setLoading(true);
      await handleBookingAction(bookingId, action, user.email);
      
      // Refetch pending bookings to update the UI
      await fetchPendingBookingsData();
      setMessage(`Booking ${action === 'confirm' ? 'confirmed' : 'rejected'} successfully`);
    } catch (error) {
      console.error(`Error ${action}ing booking:`, error);
      setError(`Failed to ${action} booking. Please try again later.`);
    } finally {
      setLoading(false);
    }
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
      <h2>Lab Slot Booking</h2>
      
      <form onSubmit={handleBookingSubmit} className="booking-form">
        <label htmlFor="facultyId">Faculty ID:</label>
        <input 
          type="text" 
          id="facultyId" 
          name="facultyId" 
          value={bookingForm.facultyId}
          onChange={handleBookingChange}
          required 
          placeholder="Enter your faculty ID"
          disabled={loading || apiError}
        />

        <label htmlFor="name">Full Name:</label>
        <input 
          type="text" 
          id="name" 
          name="name" 
          value={bookingForm.name}
          onChange={handleBookingChange}
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

        <label htmlFor="department">Department:</label>
        <select 
          id="department" 
          name="department" 
          value={bookingForm.department}
          onChange={handleBookingChange}
          required
          disabled={loading || apiError}
        >
          <option value="">Select Department</option>
          <option value="NETWORKING">Networking</option>
          <option value="CINTEL">CINTEL</option>
          <option value="DSBS">DSBS</option>
          <option value="CTECH">CTECH</option>
        </select>

        <div className="form-group">
          <label htmlFor="date">Date:</label>
          <input
            type="date"
            id="date"
            name="date"
            value={bookingForm.date}
            onChange={handleBookingChange}
            required
            disabled={loading || apiError}
            min={new Date().toISOString().split('T')[0]}
            onKeyDown={(e) => e.preventDefault()} // Prevent manual input
          />
        </div>

        <div className="form-group">
          <label htmlFor="dayOrder">Day Order:</label>
          <select
            id="dayOrder"
            name="dayOrder"
            value={bookingForm.dayOrder || ''}
            onChange={handleBookingChange}
            required
            className="day-order-select"
          >
            <option value="">Select Day Order</option>
            <option value="1">Day 1</option>
            <option value="2">Day 2</option>
            <option value="3">Day 3</option>
            <option value="4">Day 4</option>
            <option value="5">Day 5</option>
          </select>
          <div className="day-order-note" style={{
            fontSize: '0.85rem',
            color: '#666',
            marginTop: '5px',
            padding: '8px',
            backgroundColor: '#fff3e0',
            borderRadius: '4px',
            border: '1px solid #ffe0b2'
          }}>
            <strong>Important:</strong> Please select the correct day order for your chosen date. Available slots will change based on the day order schedule.
          </div>
        </div>

        <label htmlFor="lab">Select Lab:</label>
        <select 
          id="lab" 
          name="lab" 
          value={bookingForm.lab}
          onChange={handleBookingChange}
          required
          disabled={loading || apiError}
          className="lab-select"
        >
          <option value="">Select a Lab</option>
          <option value="LAB A">LAB A</option>
          <option value="LAB B">LAB B</option>
          <option value="LAB C">LAB C</option>
          <option value="LAB D">LAB D</option>
        </select>

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
            <div>Select a date and lab first</div>
          )}
        </div>

        <div className="selected-slots">
          <h3>Selected Time Slots:</h3>
          {selectedSlots.length > 0 ? (
            <div className="selected-slots-list">
              {selectedSlots.map(slot => (
                <div key={slot} className="selected-slot-item">
                  {slot}
                  <button 
                    className="remove-slot"
                    onClick={() => handleSlotSelect(slot)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>No slots selected</p>
          )}
        </div>

        <div className="button-container">
          <button 
            type="submit"
            className="booking-button"
            disabled={loading || apiError || selectedSlots.length === 0}
          >
            {loading ? 'Booking...' : `Book ${selectedSlots.length} Slot${selectedSlots.length !== 1 ? 's' : ''}`}
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

      {showBookedSlots && (
        <div className="booked-slots-section">
          <h2>Your Bookings</h2>
          
          <div className="status-filter-buttons">
            <button
              className={`status-button ${selectedStatus === 'all' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('all')}
            >
              All Bookings ({bookingCounts.waiting + bookingCounts.confirmed + bookingCounts.rejected})
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
          </div>

          {bookedSlots.length > 0 ? (
            <div className="booked-slots-list">
              {bookedSlots
                .filter(booking => selectedStatus === 'all' || booking.status === selectedStatus)
                .map((booking) => (
                  <div key={booking.id} className={`booking-card ${booking.status}`}>
                    <div className="booking-status-badge">{booking.status}</div>
                    <div className="booking-info">
                      <h3>Booking Details</h3>
                      <p><strong>Date:</strong> {booking.formatted_date || booking.date}</p>
                      <p><strong>Day Order:</strong> {booking.day_order}</p>
                      <p><strong>Lab:</strong> {booking.lab}</p>
                      <p><strong>Time Slot:</strong> {booking.time_slot}</p>
                      <p><strong>Status:</strong> {booking.status}</p>
                    </div>
                    {booking.status === 'waiting' && (
                      <button
                        className="cancel-button"
                        onClick={() => handleDeleteBookedSlot(booking.id)}
                        disabled={loading}
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className="no-bookings">
              {selectedStatus === 'all' 
                ? 'You have no bookings yet'
                : `You have no ${selectedStatus} bookings`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SlotBooking;