import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBookedSlots, handleBookingAction, fetchPendingBookings, updateBookingInTime } from '../services/api';
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

  // Warden session support
  const wardenLoggedIn = sessionStorage.getItem('wardenLoggedIn') === 'true';
  const wardenHostels = wardenLoggedIn ? JSON.parse(sessionStorage.getItem('wardenHostels') || '[]') : [];
  const wardenEmail = wardenLoggedIn ? sessionStorage.getItem('wardenEmail') : null;
  const wardenRole = wardenLoggedIn ? sessionStorage.getItem('wardenRole') : null;

  useEffect(() => {
    if (wardenLoggedIn) {
      fetchAllBookings(wardenEmail);
    } else {
      checkAdminAndFetchBookings();
    }
  }, []);

  const checkAdminAndFetchBookings = async () => {
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
  };

  const fetchAllBookings = async (adminEmail, status) => {
    try {
      setLoading(true);
      const bookingsData = await fetchPendingBookings(adminEmail) || [];
      if (!Array.isArray(bookingsData)) {
        setError('Supabase returned non-array data: ' + JSON.stringify(bookingsData));
        setLoading(false);
        return;
      }
      const statusToUse = status || selectedStatus;
      const filteredBookings = statusToUse === 'all'
        ? bookingsData 
        : bookingsData.filter(booking => booking.status === statusToUse);
      setBookings(filteredBookings);
      const waiting = bookingsData.filter(booking => booking.status === 'waiting').length;
      const still_out = bookingsData.filter(booking => booking.status === 'still_out').length;
      const confirmed = bookingsData.filter(booking => booking.status === 'confirmed').length;
      const rejected = bookingsData.filter(booking => booking.status === 'rejected').length;
      setCounts({ waiting, still_out, confirmed, rejected });
      setError(null);
    } catch (error) {
      setError('Failed to fetch bookings: ' + (error.message || JSON.stringify(error)));
      console.error('FetchAllBookings error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fix: Prevent redirect for warden users in handleStatusChange and handleSaveInTime
  const handleStatusChange = async (status) => {
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
  };

  // Update processBookingAction to move 'waiting' to 'still_out' instead of 'confirmed'
  const processBookingAction = async (bookingId, action) => {
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
      setSelectedStatus(newStatus);
      await fetchAllBookings(emailToUse, newStatus);
      setSuccess(`Request ${newStatus === 'confirmed' ? 'confirmed' : newStatus === 'still_out' ? 'moved to Still Out' : 'rejected'} successfully.`);
      if (result.emailResult) {
        if (result.emailResult.sent) {
          setToast({ message: 'Email sent to parent successfully.', type: 'info' });
        } else {
          setToast({ message: 'Booking status updated, but failed to send email to parent.' + (result.emailResult.error ? ` Error: ${result.emailResult.error}` : ''), type: 'error' });
        }
      }
    } catch (error) {
      setError(`Failed to ${action} booking.`);
      setToast({ message: error.message || JSON.stringify(error), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleInTimeChange = (bookingId, value) => {
    setEditInTime((prev) => ({ ...prev, [bookingId]: value }));
  };

  const handleSaveInTime = async (bookingId) => {
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
  };

  // Filter bookings by date range and hostel for wardens
  const filteredBookings = bookings.filter(booking => {
    // Warden: filter by assigned hostels (case-insensitive, trimmed)
    if (wardenLoggedIn && Array.isArray(wardenHostels) && wardenHostels.length > 0) {
      const normalizedHostels = wardenHostels.map(h => h.trim().toLowerCase());
      const bookingHostel = (booking.hostel_name || '').trim().toLowerCase();
      if (!normalizedHostels.includes('all') && !normalizedHostels.includes(bookingHostel)) return false;
    }
    // Admin: filter by adminHostels if provided
    if (!wardenLoggedIn && adminRole === 'warden' && Array.isArray(adminHostels) && adminHostels.length > 0) {
      const normalizedHostels = adminHostels.map(h => h.trim().toLowerCase());
      const bookingHostel = (booking.hostel_name || '').trim().toLowerCase();
      if (!normalizedHostels.includes('all') && !normalizedHostels.includes(bookingHostel)) return false;
    }
    if (!startDate && !endDate) return true;
    const outDate = booking.out_date;
    if (startDate && outDate < startDate) return false;
    if (endDate && outDate > endDate) return false;
    return true;
  });

  // Calculate counts from filteredBookings
  const filteredCounts = {
    waiting: filteredBookings.filter(b => b.status === 'waiting').length,
    confirmed: filteredBookings.filter(b => b.status === 'confirmed').length,
    rejected: filteredBookings.filter(b => b.status === 'rejected').length,
  };

  // Add sendStillOutAlert function before JSX
  const sendStillOutAlert = async (booking) => {
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
  };

  if (loading) return <div className="loading">Loading...<br/>{error && <span style={{color:'red'}}>{error}</span>}</div>;

  return (
    <div className="pending-bookings-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
      <h2>Outing Requests</h2>
      {success && <div className="success-message">{success}</div>}
      {error && <div className="error-message">{error}</div>}
      
      <div className="status-tabs">
        <button
          className={selectedStatus === 'waiting' ? 'active' : ''}
          onClick={() => handleStatusChange('waiting')}
        >
          Waiting ({filteredCounts.waiting})
        </button>
        <button
          className={selectedStatus === 'still_out' ? 'active' : ''}
          onClick={() => handleStatusChange('still_out')}
        >
          Still Out ({filteredCounts.still_out || 0})
        </button>
        <button
          className={selectedStatus === 'confirmed' ? 'active' : ''}
          onClick={() => handleStatusChange('confirmed')}
        >
          Confirmed ({filteredCounts.confirmed})
        </button>
        <button
          className={selectedStatus === 'rejected' ? 'active' : ''}
          onClick={() => handleStatusChange('rejected')}
        >
          Rejected ({filteredCounts.rejected})
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div>
          <label>Start Date: </label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label>End Date: </label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
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
                  <p><strong>Email:</strong> {booking.email}</p>
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
                        onChange={e => handleInTimeChange(booking.id, e.target.value)}
                        disabled={savingInTimeId === booking.id}
                        style={{ width: '120px' }}
                      />
                      <button
                        onClick={() => handleSaveInTime(booking.id)}
                        disabled={savingInTimeId === booking.id || !editInTime[booking.id] || editInTime[booking.id] === booking.in_time}
                        style={{ padding: '4px 10px', fontSize: '0.95em' }}
                      >
                        {savingInTimeId === booking.id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  ) : (
                  <p><strong>In Time:</strong> {booking.in_time}</p>
                  )}
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
              {selectedStatus === 'still_out' && (
                <div className="still-out-actions">
                  <button onClick={() => processBookingAction(booking.id, 'confirm')} className="in-btn">In</button>
                  <button onClick={() => sendStillOutAlert(booking)} className="alert-btn">Alert</button>
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