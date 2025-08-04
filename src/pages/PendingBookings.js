import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleBookingAction, fetchPendingBookings, updateBookingInTime, fetchAllBans } from '../services/api';
import { supabase } from '../supabaseClient';
import './PendingBookings.css';
import Toast from '../components/Toast';
import Modal from '../components/Modal';

const PendingBookings = ({ adminRole, adminHostels }) => {
  const [allBookings, setAllBookings] = useState([]); // Store all bookings (unfiltered)
  const [selectedStatus, setSelectedStatus] = useState('waiting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [counts, setCounts] = useState({ waiting: 0, still_out: 0, confirmed: 0, rejected: 0 });
  const [editInTime, setEditInTime] = useState({});
  const [savingInTimeId, setSavingInTimeId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const navigate = useNavigate();
  const [banStatuses, setBanStatuses] = useState({}); // { student_email: banObject or null }
  const [rejectionModal, setRejectionModal] = useState({ open: false, bookingId: null });
  const [rejectionReason, setRejectionReason] = useState('');
  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  // Warden session support
  const wardenLoggedIn = typeof window !== 'undefined' && sessionStorage.getItem('wardenLoggedIn') === 'true';
  const wardenHostels = wardenLoggedIn ? JSON.parse(sessionStorage.getItem('wardenHostels') || '[]') : [];
  const wardenEmail = wardenLoggedIn ? sessionStorage.getItem('wardenEmail') : null;

  const fetchBans = useCallback(async () => {
    const allBans = await fetchAllBans();
    const statuses = {};
    for (const ban of allBans) {
      if (!statuses[ban.student_email]) {
        statuses[ban.student_email] = ban;
      }
    }
    setBanStatuses(statuses);
  }, []); // `fetchAllBans` is from API (stable), `setBanStatuses` is a setState dispatch (stable)

  const fetchAllBookings = useCallback(async (adminEmail) => {
    try {
      setLoading(true);
      const bookingsData = await fetchPendingBookings(adminEmail) || [];
      if (!Array.isArray(bookingsData)) {
        setError('Supabase returned non-array data: ' + JSON.stringify(bookingsData));
        setLoading(false);
        return;
      }
      
      // Store all bookings
      setAllBookings(bookingsData);
      
      // Calculate counts from all data
      const waiting = bookingsData.filter(booking => booking.status === 'waiting').length;
      const still_out = bookingsData.filter(booking => booking.status === 'still_out').length;
      const confirmed = bookingsData.filter(booking => booking.status === 'confirmed').length;
      const rejected = bookingsData.filter(booking => booking.status === 'rejected').length;
      setCounts({ waiting, still_out, confirmed, rejected });
      
      setError(null);
      await fetchBans();
    } catch (error) {
      setError('Failed to fetch bookings: ' + (error.message || JSON.stringify(error)));
    } finally {
      setLoading(false);
    }
  }, [fetchBans]);

  const checkAdminAndFetchBookings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) {
        navigate('/login');
        return;
      }
      if (!adminRole) {
        navigate('/');
        return;
      }
      await fetchAllBookings(user.email);
    } catch (error) {
      setError('Failed to authenticate');
    }
  }, [navigate, adminRole, fetchAllBookings]);

  useEffect(() => {
    if (wardenLoggedIn) {
      fetchAllBookings(wardenEmail);
    } else {
      checkAdminAndFetchBookings();
    }
  }, [wardenLoggedIn, wardenEmail, checkAdminAndFetchBookings, fetchAllBookings]);

  const handleStatusChange = useCallback((status) => {
    setSelectedStatus(status);
    // No API call needed - just change the status filter
  }, []);

  const processBookingAction = useCallback(async (bookingId, action, reason) => {
    try {
      setLoading(true);
      let emailToUse = wardenLoggedIn ? wardenEmail : null;
      if (!wardenLoggedIn) {
        const { data: { user } } = await supabase.auth.getUser();
        emailToUse = user?.email;
      }
      let newStatus = action;
      if (selectedStatus === 'waiting' && action === 'confirm') {
        newStatus = 'still_out';
      }
      if (selectedStatus === 'still_out' && action === 'confirm') {
        newStatus = 'confirmed';
      }
      // Pass reason to API if rejecting
      const result = await handleBookingAction(bookingId, newStatus, emailToUse, reason);
      // Refresh all data after any action
      await fetchAllBookings(emailToUse);
      // Only switch tab if confirming, not for rejection
      if (newStatus === 'still_out' || newStatus === 'confirmed') {
        setSelectedStatus(newStatus);
      }
      setSuccess(`Request ${newStatus === 'confirmed' ? 'confirmed' : newStatus === 'still_out' ? 'moved to Still Out' : 'rejected'} successfully.`);
      if (result.emailResult) {
        if (result.emailResult.sent) {
          setToast({ message: 'Email sent to parent successfully.', type: 'info' });
        } else {
          setToast({ message: 'Booking status updated, but failed to send email to parent.' + (result.emailResult.error ? ` Error: ${result.emailResult.error}` : ''), type: 'error' });
        }
      }
      await fetchBans();
    } catch (error) {
      setError('Failed to process booking action.');
    } finally {
      setLoading(false);
    }
  }, [wardenLoggedIn, wardenEmail, selectedStatus, fetchAllBookings, fetchBans, handleBookingAction]);

  const handleInTimeChange = useCallback((bookingId, value) => {
    setEditInTime((prev) => ({ ...prev, [bookingId]: value }));
  }, []);

  const handleSaveInTime = useCallback(async (bookingId) => {
    setSavingInTimeId(bookingId);
    try {
      const newInTime = editInTime[bookingId];
      await updateBookingInTime(bookingId, newInTime);
      // Refresh all data after update
      if (wardenLoggedIn) {
        await fetchAllBookings(wardenEmail);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await fetchAllBookings(user.email);
      }
      setSuccess('In Time updated successfully.');
    } catch (error) {
      setError('Failed to update In Time.');
    } finally {
      setSavingInTimeId(null);
    }
  }, [editInTime, wardenLoggedIn, wardenEmail, fetchAllBookings]);

  // Bookings filtered by status, hostel/warden/admin, but NOT by date
  const hostelFilteredBookings = useMemo(() => {
    // First filter by status
    const statusFiltered = allBookings.filter(booking => 
      (booking.status || '').toLowerCase() === selectedStatus.toLowerCase()
    );
    
    // Then filter by hostel permissions
    const filtered = statusFiltered.filter(booking => {
      if (wardenLoggedIn && Array.isArray(wardenHostels) && wardenHostels.length > 0) {
        const normalizedHostels = wardenHostels.map(h => h.trim().toLowerCase());
        if (!normalizedHostels.includes('all')) {
          const bookingHostel = (booking.hostel_name || '').trim().toLowerCase();
          if (!normalizedHostels.includes(bookingHostel)) return false;
        }
      }
      if (!wardenLoggedIn && adminRole === 'warden' && Array.isArray(adminHostels) && adminHostels.length > 0) {
        const normalizedHostels = adminHostels.map(h => h.trim().toLowerCase());
        const bookingHostel = (booking.hostel_name || '').trim().toLowerCase();
        if (!normalizedHostels.includes('all') && !normalizedHostels.includes(bookingHostel)) return false;
      }
      return true;
    });
    return filtered;
  }, [allBookings, selectedStatus, wardenLoggedIn, wardenHostels, adminRole, adminHostels]);

  // Ensure tabCounts is only dependent on hostelFilteredBookings
  const tabCounts = useMemo(() => {
    const counts = {
      waiting: 0,
      still_out: 0,
      confirmed: 0,
      rejected: 0,
    };
    hostelFilteredBookings.forEach(b => {
      const status = (b.status || '').toLowerCase();
      if (counts.hasOwnProperty(status)) {
        counts[status]++;
      }
    });
    return counts;
  }, [hostelFilteredBookings]);

  // Function to check if student is late
  const isStudentLate = useCallback((booking) => {
    if (booking.status !== 'still_out') return false;
    
    const now = new Date();
    const outTime = new Date(`${booking.out_date}T${booking.out_time}`);
    const expectedReturn = new Date(`${booking.in_date}T${booking.in_time}`);
    
    // Check for impossible time combination (out time later than in time on same day)
    if (booking.out_date === booking.in_date && outTime > expectedReturn) {
      // This is likely a data entry error - assume in time should be PM if out time is AM
      // or out time should be PM if in time is AM
      return false; // Don't mark as late for impossible combinations
    }
    
    return now > expectedReturn;
  }, []);

  // Function to calculate how late the student is
  const getLateDuration = useCallback((booking) => {
    if (!isStudentLate(booking)) return null;
    
    const now = new Date();
    const outTime = new Date(`${booking.out_date}T${booking.out_time}`);
    const expectedReturn = new Date(`${booking.in_date}T${booking.in_time}`);
    
    // Check for impossible time combination
    if (booking.out_date === booking.in_date && outTime > expectedReturn) {
      return null; // Don't show late duration for impossible combinations
    }
    
    const diffMs = now - expectedReturn;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m late`;
    } else {
      return `${minutes}m late`;
    }
  }, [isStudentLate]);

  // Bookings filtered by hostel/warden/admin AND date AND search
  const filteredBookings = useMemo(() => {
    let filtered = hostelFilteredBookings.filter(booking => {
      if (!startDate && !endDate) return true;
      const outDate = booking.out_date;
      if (startDate && outDate < startDate) return false;
      if (endDate && outDate > endDate) return false;
      return true;
    });

    // Apply search filter if search is active
    if (searchActive && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(booking => 
        booking.email && booking.email.toLowerCase().includes(query)
      );
    }

    // Sort: late students first, then normal bookings
    filtered.sort((a, b) => {
      const aIsLate = isStudentLate(a);
      const bIsLate = isStudentLate(b);
      
      if (aIsLate && !bIsLate) return -1; // a comes first
      if (!aIsLate && bIsLate) return 1;  // b comes first
      return 0; // both same status, maintain original order
    });

    return filtered;
  }, [hostelFilteredBookings, startDate, endDate, searchQuery, searchActive, isStudentLate]);

  const sendStillOutAlert = useCallback(async (booking) => {
    try {
      setLoading(true);
      // Send custom email to parent
      const functionUrl = 'https://fwnknmqlhlyxdeyfcrad.supabase.co/functions/v1/send-email';
      const html = `
        <p>Dear Parent,</p>
        <p>Your ward <b>${booking.name}</b> (${booking.email}) from <b>${booking.hostel_name}</b> has not returned by the expected time.</p>
        <p>Please contact the hostel administration for more information.</p>
        <p><i>This is an automated alert.</i></p>
      `;
      const emailRes = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: booking.parent_email,
          subject: 'Alert: Your ward is still out',
          html
        })
      });
      const emailData = await emailRes.json();
      if (emailRes.ok && !emailData.error) {
        setToast({ message: 'Alert email sent to parent successfully.', type: 'info' });
      } else {
        setToast({ message: 'Failed to send alert email to parent.' + (emailData.error ? ` Error: ${emailData.error}` : ''), type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Failed to send alert email: ' + (err.message || err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStatusChangeFactory = useCallback((status) => () => handleStatusChange(status), [handleStatusChange]);
  const handleStartDateChange = useCallback((e) => setStartDate(e.target.value), []);
  const handleEndDateChange = useCallback((e) => setEndDate(e.target.value), []);
  const handleToastClose = useCallback(() => setToast({ message: '', type: 'info' }), []);
  const handleInTimeChangeFactory = useCallback((id) => (e) => handleInTimeChange(id, e.target.value), [handleInTimeChange]);
  const handleProcessBookingStillOutConfirmFactory = useCallback((id) => () => processBookingAction(id, 'confirm'), [processBookingAction]);

  // Search handlers
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchQuery(value);
    // Auto-activate search if 4+ characters
    if (value.length >= 4) {
      setSearchActive(true);
    } else if (value.length === 0) {
      setSearchActive(false);
    }
  }, []);

  const handleSearchKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setSearchActive(true);
    }
  }, [searchQuery]);

  const handleSearchClick = useCallback(() => {
    if (searchQuery.trim()) {
      setSearchActive(true);
    }
  }, [searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchActive(false);
  }, []);



  // Add handler factories at the top of the component
  const handleProcessBookingConfirm = useCallback((id) => () => processBookingAction(id, 'confirm'), [processBookingAction]);
  const handleProcessBookingReject = useCallback((id) => () => {
    setRejectionModal({ open: true, bookingId: id });
  }, []);
  const handleRejectionSubmit = async () => {
    await processBookingAction(rejectionModal.bookingId, 'reject', rejectionReason);
    setRejectionModal({ open: false, bookingId: null });
    setRejectionReason('');
  };
  const handleSaveInTimeFactory = useCallback((id) => () => handleSaveInTime(id), [handleSaveInTime]);
  const handleSendStillOutAlertFactory = useCallback((booking) => () => sendStillOutAlert(booking), [sendStillOutAlert]);

  if (loading) return <div className="loading">Loading...<br/>{error && <span style={{color:'red'}}>{error}</span>}</div>;

  return (
    <div className="pending-bookings-page">
      <Toast message={toast.message} type={toast.type} onClose={handleToastClose} />
      <h2>Outing Requests</h2>
      {success && <div className="success-message">{success}</div>}
      {error && <div className="error-message">{error}</div>}
      
      <div className="status-tabs">
        <button
          className={selectedStatus === 'waiting' ? 'active' : ''}
          onClick={handleStatusChangeFactory('waiting')}
        >
          Waiting ({tabCounts.waiting})
        </button>
        <button
          className={selectedStatus === 'still_out' ? 'active' : ''}
          onClick={handleStatusChangeFactory('still_out')}
        >
          Still Out ({tabCounts.still_out || 0})
        </button>
        <button
          className={selectedStatus === 'confirmed' ? 'active' : ''}
          onClick={handleStatusChangeFactory('confirmed')}
        >
          Confirmed ({tabCounts.confirmed})
        </button>
        <button
          className={selectedStatus === 'rejected' ? 'active' : ''}
          onClick={handleStatusChangeFactory('rejected')}
        >
          Rejected ({tabCounts.rejected})
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label>Start Date: </label>
          <input type="date" value={startDate} onChange={handleStartDateChange} />
        </div>
        <div>
          <label>End Date: </label>
          <input type="date" value={endDate} onChange={handleEndDateChange} />
        </div>
        <div className="search-container">
          <div className="search-input-group">
            <label>Search by Email:</label>
            <input 
              type="text" 
              className="search-input"
              placeholder="Enter email to search..." 
              value={searchQuery} 
              onChange={handleSearchChange}
              onKeyPress={handleSearchKeyPress}
            />
          </div>
          <button 
            className="search-button"
            onClick={handleSearchClick}
            disabled={!searchQuery.trim()}
          >
            Search
          </button>
          {searchActive && (
            <button 
              className="clear-button"
              onClick={handleClearSearch}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {searchActive && (
        <div className="search-active-indicator">
          🔍 Searching for: <strong>{searchQuery}</strong> ({filteredBookings.length} results found)
        </div>
      )}
      

      
      {filteredBookings.length > 0 ? (
        <div className="bookings-list">
          {filteredBookings.map(booking => (
            <div key={booking.id} className="booking-card">
              <div className={`status-badge ${booking.status}`}>
                {booking.status.toUpperCase()}
                {isStudentLate(booking) && (
                  <span style={{ 
                    marginLeft: '8px', 
                    background: '#dc3545', 
                    color: 'white', 
                    padding: '2px 6px', 
                    borderRadius: '8px', 
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    LATE
                  </span>
                )}

              </div>

              <div className="booking-info">
                <div className="info-group">
                  <h3>User Details</h3>
                  <p><strong>Name:</strong> {booking.name}</p>
                  <p><strong>Email:</strong> {booking.email}
                    {banStatuses[booking.email] && (
                      <span style={{ background: '#dc3545', color: 'white', borderRadius: 4, padding: '2px 8px', fontWeight: 600, marginLeft: 6, fontSize: 12 }}>BANNED</span>
                    )}
                  </p>
                  <p><strong>Hostel Name:</strong> {booking.hostel_name}</p>
                  <p><strong>Room Number:</strong> {booking.room_number || 'N/A'}</p>
                  <p><strong>Parent Phone:</strong> {booking.parent_phone || 'N/A'}</p>
                </div>
                <div className="info-group">
                  <h3>Booking Details</h3>
                  <p><strong>Out Date:</strong> {booking.out_date}</p>
                  <p><strong>Out Time:</strong> {booking.out_time}</p>
                  <p><strong>In Date:</strong> {booking.in_date}</p>
                  {selectedStatus === 'waiting' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor={`inTime-${booking.id}`} style={{ margin: 0 }}><strong>In Time:</strong></label>
                      <input
                        id={`inTime-${booking.id}`}
                        type="time"
                        value={editInTime[booking.id] !== undefined ? editInTime[booking.id] : booking.in_time || ''}
                        onChange={handleInTimeChangeFactory(booking.id)}
                        disabled={savingInTimeId === booking.id}
                        style={{ width: '120px' }}
                      />
                      <button
                        onClick={handleSaveInTimeFactory(booking.id)}
                        disabled={savingInTimeId === booking.id || !editInTime[booking.id] || editInTime[booking.id] === booking.in_time}
                        style={{ padding: '4px 10px', fontSize: '0.95em' }}
                      >
                        {savingInTimeId === booking.id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  ) : (
                  <p><strong>In Time:</strong> {booking.in_time}</p>
                  )}
                  {/* Number of days calculation */}
                  <p><strong>Number of Days:</strong> {(() => {
                    const outDate = new Date(booking.out_date);
                    const inDate = new Date(booking.in_date);
                    if (!isNaN(outDate) && !isNaN(inDate)) {
                      // Add 1 to include both out and in date
                      const diff = Math.round((inDate - outDate) / (1000 * 60 * 60 * 24)) + 1;
                      return diff > 0 ? diff : 1;
                    }
                    return 'N/A';
                  })()}</p>
                  {/* Reason with improved styling */}
                  <p><strong>Reason:</strong> <span style={{ fontWeight: 600, color: '#333' }}>{booking.reason ? booking.reason : 'No reason provided'}</span></p>
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
                    onClick={handleProcessBookingConfirm(booking.id)}
                    className="confirm-button"
                    disabled={loading}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={handleProcessBookingReject(booking.id)}
                    className="reject-button"
                    disabled={loading}
                  >
                    Reject
                  </button>
                </div>
              )}
              {selectedStatus === 'still_out' && (
                <div className="still-out-actions">
                  <button onClick={handleProcessBookingStillOutConfirmFactory(booking.id)} className="in-btn">In</button>
                  <button onClick={handleSendStillOutAlertFactory(booking)} className="alert-btn">Alert</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="no-bookings">No {selectedStatus} requests available</div>
      )}
      {rejectionModal.open && (
        <Modal onClose={() => setRejectionModal({ open: false, bookingId: null })}>
          <h3>Reject Booking</h3>
          <textarea
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            placeholder="Enter reason for rejection..."
            style={{ width: '100%', minHeight: 60, marginBottom: 16 }}
          />
          <button onClick={handleRejectionSubmit} style={{ background: '#dc3545', color: 'white', marginRight: 8 }}>Reject</button>
          <button onClick={() => setRejectionModal({ open: false, bookingId: null })}>Cancel</button>
        </Modal>
      )}
    </div>
  );
};

export default PendingBookings; 
