import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
    fetchDayOrder, 
    fetchTimeSlots, 
    bookSlot, 
    fetchBookedSlots, 
    deleteBooking,
    checkStudentBanStatus,
    checkAndAutoUnban
} from '../services/api';
import './SlotBooking.css';
import { supabase } from '../supabaseClient';

const initialState = {
  booking: { day_order: '', time_slot: '', reason: '' },
  selectedSlots: [],
  bookedSlots: [],
  loading: false,
  error: null,
  success: null,
  statusFilter: 'all',
  banStatus: { isBanned: false, till: null },
  blockBooking: false,
};

function bookingReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false, success: null };
    case 'SET_SUCCESS':
        return { ...state, success: action.payload, loading: false, error: null };
    case 'SET_BOOKED_SLOTS':
      return { ...state, bookedSlots: action.payload };
    case 'UPDATE_BOOKING_INPUT':
      return { ...state, booking: { ...state.booking, [action.payload.name]: action.payload.value } };
    case 'TOGGLE_SLOT_SELECTION': {
        const { slot, dayOrder } = action.payload;
        const existingIndex = state.selectedSlots.findIndex(s => s.slot === slot.slot);
        let newSelectedSlots;
        if (existingIndex > -1) {
            newSelectedSlots = state.selectedSlots.filter(s => s.slot !== slot.slot);
        } else {
            newSelectedSlots = [...state.selectedSlots, { ...slot, day_order: dayOrder }];
        }
        return { 
            ...state, 
            selectedSlots: newSelectedSlots,
            booking: { ...state.booking, time_slot: newSelectedSlots.map(s => s.slot).join(', ') }
        };
    }
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.payload };
    case 'SET_BAN_STATUS':
      return { ...state, banStatus: action.payload };
    case 'SET_BLOCK_BOOKING':
      return { ...state, blockBooking: action.payload };
    case 'RESET_FORM':
        return { 
            ...state, 
            booking: initialState.booking, 
            selectedSlots: [], 
            success: action.payload || state.success,
            error: null,
        };
    default:
      return state;
  }
}

const SlotBooking = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState(null);
    const [dayOrder, setDayOrder] = useState(null);
    const [timeSlots, setTimeSlots] = useState([]);
    const [toast, setToast] = useState({ message: '', type: '' });

    const [state, dispatch] = useReducer(bookingReducer, initialState);
    const { booking, selectedSlots, bookedSlots, loading, error, success, statusFilter, banStatus, blockBooking } = state;

    const fetchUserAndBookings = useCallback(async () => {
        dispatch({ type: 'SET_LOADING', payload: true });
        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
                setUser(currentUser);
                await checkAndUnban(currentUser.email);
                
                const banData = await checkStudentBanStatus(currentUser.email);
                dispatch({ type: 'SET_BAN_STATUS', payload: banData });

                const slots = await fetchBookedSlots(currentUser.email);
                dispatch({ type: 'SET_BOOKED_SLOTS', payload: slots || [] });
                
                const hasPending = slots.some(s => s.status === 'waiting' || s.status === 'still_out');
                dispatch({ type: 'SET_BLOCK_BOOKING', payload: hasPending });
            }
             dispatch({ type: 'SET_LOADING', payload: false });
        } catch (err) {
            dispatch({ type: 'SET_ERROR', payload: 'Failed to fetch user data or bookings.' });
        }
    }, []);

    const checkAndUnban = useCallback(async (email) => {
        try {
            const wasUnbanned = await checkAndAutoUnban(email);
            if (wasUnbanned) {
                console.log(`Auto-unbanned student: ${email}`);
                const banData = await checkStudentBanStatus(email);
                dispatch({ type: 'SET_BAN_STATUS', payload: banData });
            }
        } catch (error) {
            console.error("Error during auto-unban check:", error);
        }
    }, []);

    useEffect(() => {
        fetchUserAndBookings();
    }, [fetchUserAndBookings]);

    useEffect(() => {
        const fetchDayOrderAndTimeSlots = async () => {
            try {
                const order = await fetchDayOrder();
                setDayOrder(order);
                const slots = await fetchTimeSlots();
                setTimeSlots(slots);
            } catch (error) {
                console.error("Error fetching day order or time slots:", error);
                setToast({ message: 'Error fetching schedule.', type: 'error' });
            }
        };
        fetchDayOrderAndTimeSlots();
    }, []);

    const handleBookingChange = useCallback((e) => {
        const { name, value } = e.target;
        dispatch({ type: 'UPDATE_BOOKING_INPUT', payload: { name, value } });
    }, []);

    const handleSlotSelect = useCallback((slot) => {
         dispatch({ type: 'TOGGLE_SLOT_SELECTION', payload: { slot, dayOrder: dayOrder?.day_order } });
    }, [dayOrder]);

    const handleBookingSubmit = async (e) => {
        e.preventDefault();
        if (selectedSlots.length === 0 || !booking.reason) {
            dispatch({ type: 'SET_ERROR', payload: 'Please select at least one time slot and provide a reason.' });
            return;
        }
        dispatch({ type: 'SET_LOADING', payload: true });

        try {
            const bookingPromises = selectedSlots.map(slot => {
                const bookingData = {
                    user_id: user.id,
                    day_order: slot.day_order,
                    time_slot: slot.slot,
                    reason: booking.reason,
                    status: 'waiting',
                    student_email: user.email,
                };
                return bookSlot(bookingData);
            });

            await Promise.all(bookingPromises);
            dispatch({ type: 'RESET_FORM', payload: 'Booking request(s) submitted successfully!' });
            fetchUserAndBookings();
        } catch (err) {
            dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to book slot.' });
        }
    };

    const handleDeleteBooking = useCallback(async (bookingId) => {
        if (!window.confirm('Are you sure you want to delete this booking request?')) return;
        dispatch({ type: 'SET_LOADING', payload: true });
        try {
            await deleteBooking(bookingId);
            dispatch({ type: 'SET_SUCCESS', payload: 'Booking deleted successfully.' });
            fetchUserAndBookings();
        } catch (err) {
            dispatch({ type: 'SET_ERROR', payload: 'Failed to delete booking.' });
        }
    }, [fetchUserAndBookings]);

    const handleStatusFilter = useCallback((e) => {
        dispatch({ type: 'SET_STATUS_FILTER', payload: e.target.value });
    }, []);

    const handleDeleteBookingFactory = useCallback((id) => () => handleDeleteBooking(id), [handleDeleteBooking]);
    const handleSlotSelectFactory = useCallback((slot) => () => handleSlotSelect(slot), [handleSlotSelect]);

    const availableTimeSlots = useMemo(() => {
        const booked = bookedSlots.map(b => b.time_slot);
        return timeSlots.map(slot => ({
            ...slot,
            available: !booked.includes(slot.slot)
        }));
    }, [timeSlots, bookedSlots]);
    
    const filteredBookings = useMemo(() => {
        if (statusFilter === 'all') return bookedSlots;
        return bookedSlots.filter(b => b.status === statusFilter);
    }, [bookedSlots, statusFilter]);
    
    const currentBooking = useMemo(() => 
        bookedSlots.find(b => b.status === 'waiting' || b.status === 'still_out')
    , [bookedSlots]);
    
    const latestOtpBooking = useMemo(() => 
        bookedSlots
        .filter(b => (b.status === 'confirmed' || b.status === 'still_out') && b.otp)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    , [bookedSlots]);

    const oldConfirmedBookings = useMemo(() => 
        bookedSlots
        .filter(b => b.status === 'confirmed')
    , [bookedSlots]);

    const handleToastClose = useCallback(() => {
        setToast({ message: '', type: '' });
    }, []);

    return (
        <div className="slot-booking-container">
            <h2>Request Outing</h2>
            
            {banStatus.isBanned && (
                <div style={{ color: 'red', fontWeight: 600, marginBottom: 24, fontSize: 18 }}>
                    You are banned from making outing requests until {banStatus.till_date}.
                </div>
            )}
            
            {blockBooking && (
                <div style={{ color: 'red', fontWeight: 600, marginBottom: 24, fontSize: 18 }}>
                    You already have a pending or active outing request. Please complete or delete it before making a new one.
                </div>
            )}
            
            <form onSubmit={handleBookingSubmit} className="booking-form" style={{ pointerEvents: blockBooking ? 'none' : 'auto', opacity: blockBooking ? 0.5 : 1 }}>
                <label htmlFor="name">Full Name:</label>
                <input 
                    type="text" 
                    id="name" 
                    name="name" 
                    value={user?.user_metadata?.full_name || user?.email}
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
                    value={user?.email}
                    readOnly
                    disabled
                    className="readonly-input"
                />

                <label htmlFor="department">Hostel Name:</label>
                <input
                    type="text"
                    id="department"
                    name="department"
                    value={user?.user_metadata?.hostel_name || ''}
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
                        value={booking.outDate}
                        onChange={handleBookingChange}
                        required
                        disabled={(!user?.user_metadata?.is_admin && !user?.user_metadata?.student_info_exists) || loading}
                        min={new Date().toISOString().split('T')[0]}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="outTime">Out Time:</label>
                    <input
                        type="time"
                        id="outTime"
                        name="outTime"
                        value={booking.outTime}
                        onChange={handleBookingChange}
                        required
                        disabled={(!user?.user_metadata?.is_admin && !user?.user_metadata?.student_info_exists) || loading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="inDate">In Date:</label>
                    <input
                        type="date"
                        id="inDate"
                        name="inDate"
                        value={booking.inDate}
                        onChange={handleBookingChange}
                        required
                        disabled={(!user?.user_metadata?.is_admin && !user?.user_metadata?.student_info_exists) || loading}
                        min={booking.outDate || new Date().toISOString().split('T')[0]}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="inTime">In Time:</label>
                    <input
                        type="time"
                        id="inTime"
                        name="inTime"
                        value={booking.inTime}
                        onChange={handleBookingChange}
                        required
                        disabled={(!user?.user_metadata?.is_admin && !user?.user_metadata?.student_info_exists) || loading}
                    />
                </div>

                <label htmlFor="parentEmail">Parent Email:</label>
                <input
                    type="email"
                    id="parentEmail"
                    name="parentEmail"
                    value={user?.user_metadata?.parent_email || ''}
                    readOnly
                    disabled
                    className="readonly-input"
                />

                <label htmlFor="parentPhone">Parent Phone:</label>
                <input
                    type="text"
                    id="parentPhone"
                    name="parentPhone"
                    value={user?.user_metadata?.parent_phone || ''}
                    readOnly
                    disabled
                    className="readonly-input"
                />

                <div className="time-slots-grid">
                    {loading && selectedSlots.length === 0 ? (
                        <div>Loading available slots...</div>
                    ) : availableTimeSlots.length > 0 ? (
                        availableTimeSlots.map(slot => (
                            <div
                                key={slot.slot}
                                className={`time-slot-item ${!slot.available ? 'disabled' : ''} ${selectedSlots.some(s => s.slot === slot.slot) ? 'selected' : ''}`}
                                onClick={slot.available ? handleSlotSelectFactory(slot) : undefined}
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
                        <div>No available slots for this date and lab.</div>
                    )}
                </div>

                <div className="form-group">
                    <label htmlFor="reason">Reason for Outing:</label>
                    <textarea
                        id="reason"
                        name="reason"
                        value={booking.reason}
                        onChange={handleBookingChange}
                        required
                        placeholder="e.g., Medical appointment, family emergency, etc."
                        disabled={(!user?.user_metadata?.is_admin && !user?.user_metadata?.student_info_exists) || loading}
                    />
                </div>

                <div className="button-container">
                    <button 
                        type="submit"
                        className="booking-button"
                        disabled={(!user?.user_metadata?.is_admin && !user?.user_metadata?.student_info_exists) || loading ||
                            selectedSlots.length === 0 ||
                            !booking.reason ||
                            !booking.outDate ||
                            !booking.outTime ||
                            !booking.inDate ||
                            !booking.inTime ||
                            !user?.user_metadata?.parent_email ||
                            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user?.user_metadata?.parent_email)
                        }
                    >
                        {loading ? 'Sending...' : 'Send Request'}
                    </button>
                </div>
            </form>

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
            
            {toast.message && (
                <div className={`message ${toast.type === 'error' ? 'error' : 'success'}`}>
                    {toast.message}
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