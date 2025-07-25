import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBookedSlots, handleBookingAction, fetchPendingBookings, updateBookingInTime, fetchAllBans } from '../services/api';
import { supabase } from '../supabaseClient';
import './PendingBookings.css';
import Toast from '../components/Toast';

const PendingBookings = ({ adminRole, adminHostels }) => {
  const [bookings, setBookings] = useState([]);
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

  // Warden session support
  const wardenLoggedIn = sessionStorage.getItem('wardenLoggedIn') === 'true';
  const wardenHostels = wardenLoggedIn ? JSON.parse(sessionStorage.getItem('wardenHostels') || '[]') : [];
  const wardenEmail = wardenLoggedIn ? sessionStorage.getItem('wardenEmail') : null;
  const wardenRole = wardenLoggedIn ? sessionStorage.getItem('wardenRole') : null;

  console.log('wardenHostels:', wardenHostels);

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

  const fetchAllBookings = useCallback(async (adminEmail, status) => {
    try {
      setLoading(true);
      const bookingsData = await fetchPendingBookings(adminEmail) || [];
      // Debug log: print all bookings fetched
      console.log('Fetched bookings:', bookingsData.map(b => ({id: b.id, status: b.status, hostel: b.hostel_name, email: b.email})));
      if (!Array.isArray(bookingsData)) {
        setError('Supabase returned non-array data: ' + JSON.stringify(bookingsData));
        setLoading(false);
        return;
      }
      const statusToUse = status || selectedStatus;
      const filteredBookings = statusToUse === 'all'
        ? bookingsData 
        : bookingsData.filter(booking => (booking.status || '').toLowerCase() === statusToUse.toLowerCase());
      setBookings(filteredBookings);
      const waiting = bookingsData.filter(booking => booking.status === 'waiting').length;
      const still_out = bookingsData.filter(booking => booking.status === 'still_out').length;
      const confirmed = bookingsData.filter(booking => booking.status === 'confirmed').length;
      const rejected = bookingsData.filter(booking => booking.status === 'rejected').length;
      setCounts({ waiting, still_out, confirmed, rejected });
      setError(null);
      await fetchBans();
    } catch (error) {
      setError('Failed to fetch bookings: ' + (error.message || JSON.stringify(error)));
      console.error('FetchAllBookings error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, fetchBans]);

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
      console.error('Error in checkAdminAndFetchBookings:', error);
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

  const handleStatusChange = useCallback(async (status) => {
    setSelectedStatus(status);
    try {
      setLoading(true);
      if (wardenLoggedIn) {
        await fetchAllBookings(wardenEmail, status);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await fetchAllBookings(user.email, status);
      }
      setError(null);
    } catch (error) {
      setError('Failed to filter bookings.');
    } finally {
      setLoading(false);
    }
  }, [wardenLoggedIn, wardenEmail, fetchAllBookings]);

  const processBookingAction = useCallback(async (bookingId, action) => {
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
      const result = await handleBookingAction(bookingId, newStatus, emailToUse);
      // Only switch tab if confirming, not for rejection
      if (newStatus === 'still_out' || newStatus === 'confirmed') {
      setSelectedStatus(newStatus);
      await fetchAllBookings(emailToUse, newStatus);
      } else {
        // For rejection, stay on current tab and just refresh
        await fetchAllBookings(emailToUse, selectedStatus);
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
      if (wardenLoggedIn) {
        await fetchAllBookings(wardenEmail, selectedStatus);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await fetchAllBookings(user.email, selectedStatus);
      }
      setSuccess('In Time updated successfully.');
    } catch (error) {
      setError('Failed to update In Time.');
    } finally {
      setSavingInTimeId(null);
    }
  }, [editInTime, wardenLoggedIn, wardenEmail, selectedStatus, fetchAllBookings]);

  // Bookings filtered by hostel/warden/admin, but NOT by date
  const hostelFilteredBookings = useMemo(() => {
    const filtered = bookings.filter(booking => {
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
    console.log('hostelFilteredBookings:', filtered);
    return filtered;
  }, [bookings, wardenLoggedIn, wardenHostels, adminRole, adminHostels]);

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
    console.log('tabCounts:', counts);
    return counts;
  }, [hostelFilteredBookings]);

  // Bookings filtered by hostel/warden/admin AND date
  const filteredBookings = useMemo(() => hostelFilteredBookings.filter(booking => {
    if (!startDate && !endDate) return true;
    const outDate = booking.out_date;
    if (startDate && outDate < startDate) return false;
    if (endDate && outDate > endDate) return false;
    return true;
  }), [hostelFilteredBookings, startDate, endDate]);

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

  // Add handler factories at the top of the component
  const handleProcessBookingConfirm = useCallback((id) => () => processBookingAction(id, 'confirm'), [processBookingAction]);
  const handleProcessBookingReject = useCallback((id) => () => processBookingAction(id, 'reject'), [processBookingAction]);
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
      
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div>
          <label>Start Date: </label>
          <input type="date" value={startDate} onChange={handleStartDateChange} />
        </div>
        <div>
          <label>End Date: </label>
          <input type="date" value={endDate} onChange={handleEndDateChange} />
        </div>
      </div>
      
      {filteredBookings.length > 0 ? (
        <div className="bookings-list">
          {filteredBookings.map(booking => (
            <div key={booking.id} className="booking-card">
              <div className={`status-badge ${booking.status}`}>{booking.status.toUpperCase()}</div>
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
                  <p><strong>Reason:</strong> {booking.reason ? booking.reason : 'No reason provided'}</p>
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
    </div>
  );
};

export default PendingBookings; 