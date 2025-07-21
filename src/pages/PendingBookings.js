import React, { useEffect, useMemo, useCallback, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { FixedSizeList as List } from 'react-window';
import { fetchPendingBookings, handleBookingAction, updateBookingInTime, fetchAllBans } from '../services/api';
import { supabase } from '../supabaseClient';
import './PendingBookings.css';
import Toast from '../components/Toast';

const initialState = {
  bookings: [],
  selectedStatus: 'waiting',
  loading: true,
  error: null,
  success: null,
  counts: { waiting: 0, still_out: 0, confirmed: 0, rejected: 0 },
  editInTime: {},
  savingInTimeId: null,
  startDate: '',
  endDate: '',
  user: null,
  toast: { message: '', type: 'info' },
  banStatuses: {},
  page: 0,
  hasMore: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_BOOKINGS':
      return { ...state, bookings: action.payload };
    case 'LOAD_MORE_BOOKINGS':
      return { ...state, bookings: [...state.bookings, ...action.payload], page: state.page + 1 };
    case 'SET_HAS_MORE':
      return { ...state, hasMore: action.payload };
    default:
      return state;
  }
}

const BookingRow = React.memo(({ data, index, style }) => {
  const {
    filteredBookings, selectedStatus, loading, banStatuses, editInTime, savingInTimeId,
    handleProcessBookingConfirm, handleProcessBookingReject, handleSaveInTimeFactory,
    handleSendStillOutAlertFactory, handleInTimeChangeFactory, handleProcessBookingStillOutConfirmFactory
  } = data;

  if (index === filteredBookings.length) {
    return data.hasMore ? <div style={style}>Loading...</div> : null;
  }

  const booking = filteredBookings[index];
  return (
    <div style={style}>
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
    </div>
  );
});

const PendingBookings = ({ adminRole, adminHostels }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    bookings, selectedStatus, loading, error, success, counts, editInTime, savingInTimeId,
    startDate, endDate, user, toast, banStatuses, page, hasMore
  } = state;

  const navigate = useNavigate();
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
    dispatch({ type: 'SET_FIELD', field: 'banStatuses', value: statuses });
  }, []); // `fetchAllBans` is from API (stable), `setBanStatuses` is a setState dispatch (stable)

  const fetchAllBookings = useCallback(async (adminEmail, status, page = 0) => {
    try {
      dispatch({ type: 'SET_FIELD', field: 'loading', value: true });
      const bookingsData = await fetchPendingBookings(adminEmail, page * 10, 10, status) || []; // Temporarily fetch up to 1000
      dispatch({ type: 'SET_BOOKINGS', payload: bookingsData });
      // This is now less accurate as it's only for the fetched page.
      // A separate count query would be needed for total accuracy.
      const waiting = bookingsData.filter(booking => booking.status === 'waiting').length;
      const still_out = bookingsData.filter(booking => booking.status === 'still_out').length;
      const confirmed = bookingsData.filter(booking => booking.status === 'confirmed').length;
      const rejected = bookingsData.filter(booking => booking.status === 'rejected').length;
      dispatch({ type: 'SET_FIELD', field: 'counts', value: { waiting, still_out, confirmed, rejected } });
      dispatch({ type: 'SET_HAS_MORE', payload: bookingsData.length === 10 }); // Assuming 10 items per page
      dispatch({ type: 'SET_FIELD', field: 'page', value: page + 1 });
      dispatch({ type: 'SET_FIELD', field: 'error', value: null });
      await fetchBans();
    } catch (error) {
      dispatch({ type: 'SET_FIELD', field: 'error', value: 'Failed to fetch bookings: ' + (error.message || JSON.stringify(error)) });
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'loading', value: false });
    }
  }, [fetchBans]);

  const loadMoreBookings = useCallback(async () => {
    if (hasMore && !loading) {
      await fetchAllBookings(user?.email, selectedStatus, page);
    }
  }, [fetchAllBookings, user, selectedStatus, page, hasMore, loading]);

  useEffect(() => {
    const checkAdminAndFetchBookings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        dispatch({ type: 'SET_FIELD', field: 'user', value: user });
        if (!user) {
          navigate('/login');
          return;
        }
        if (!adminRole) {
          navigate('/');
          return;
        }
        await fetchAllBookings(user.email, selectedStatus, 0);
      } catch (error) {
        dispatch({ type: 'SET_FIELD', field: 'error', value: 'Failed to authenticate' });
      }
    };

    if (wardenLoggedIn) {
      fetchAllBookings(wardenEmail, selectedStatus, 0);
    } else {
      checkAdminAndFetchBookings();
    }
  }, [wardenLoggedIn, wardenEmail, adminRole, selectedStatus, fetchAllBookings, navigate, user, page]);

  const handleStatusChange = useCallback(async (status) => {
    dispatch({ type: 'SET_FIELD', field: 'selectedStatus', value: status });
    // Data will be refetched by the useEffect hook above
  }, []);

  const processBookingAction = useCallback(async (bookingId, action) => {
    try {
      dispatch({ type: 'SET_FIELD', field: 'loading', value: true });
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
      dispatch({ type: 'SET_FIELD', field: 'selectedStatus', value: newStatus });
      await fetchAllBookings(emailToUse, newStatus, page);
      } else {
        // For rejection, stay on current tab and just refresh
        await fetchAllBookings(emailToUse, selectedStatus, page);
      }
      dispatch({ type: 'SET_FIELD', field: 'success', value: `Request ${newStatus === 'confirmed' ? 'confirmed' : newStatus === 'still_out' ? 'moved to Still Out' : 'rejected'} successfully.` });
      if (result.emailResult) {
        if (result.emailResult.sent) {
          dispatch({ type: 'SET_FIELD', field: 'toast', value: { message: 'Email sent to parent successfully.', type: 'info' } });
        } else {
          dispatch({ type: 'SET_FIELD', field: 'toast', value: { message: 'Booking status updated, but failed to send email to parent.' + (result.emailResult.error ? ` Error: ${result.emailResult.error}` : ''), type: 'error' } });
        }
      }
      await fetchBans();
    } catch (error) {
      dispatch({ type: 'SET_FIELD', field: 'error', value: 'Failed to process booking action.' });
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'loading', value: false });
    }
  }, [wardenLoggedIn, wardenEmail, selectedStatus, fetchAllBookings, fetchBans, handleBookingAction, page]);

  const handleInTimeChange = useCallback((bookingId, value) => {
    dispatch({ type: 'SET_FIELD', field: 'editInTime', value: { ...editInTime, [bookingId]: value } });
  }, [editInTime]);

  const handleSaveInTime = useCallback(async (bookingId) => {
    dispatch({ type: 'SET_FIELD', field: 'savingInTimeId', value: bookingId });
    try {
      const newInTime = editInTime[bookingId];
      await updateBookingInTime(bookingId, newInTime);
      if (wardenLoggedIn) {
        await fetchAllBookings(wardenEmail, selectedStatus, page);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await fetchAllBookings(user.email, selectedStatus, page);
      }
      dispatch({ type: 'SET_FIELD', field: 'success', value: 'In Time updated successfully.' });
    } catch (error) {
      dispatch({ type: 'SET_FIELD', field: 'error', value: 'Failed to update In Time.' });
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'savingInTimeId', value: null });
    }
  }, [editInTime, wardenLoggedIn, wardenEmail, selectedStatus, fetchAllBookings, page]);

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
      dispatch({ type: 'SET_FIELD', field: 'loading', value: true });
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
        dispatch({ type: 'SET_FIELD', field: 'toast', value: { message: 'Alert email sent to parent successfully.', type: 'info' } });
      } else {
        dispatch({ type: 'SET_FIELD', field: 'toast', value: { message: 'Failed to send alert email to parent.' + (emailData.error ? ` Error: ${emailData.error}` : ''), type: 'error' } });
      }
    } catch (err) {
      dispatch({ type: 'SET_FIELD', field: 'toast', value: { message: 'Failed to send alert email: ' + (err.message || err), type: 'error' } });
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'loading', value: false });
    }
  }, []);

  const handleStatusChangeFactory = useCallback((status) => () => handleStatusChange(status), [handleStatusChange]);
  const handleStartDateChange = useCallback((e) => dispatch({ type: 'SET_FIELD', field: 'startDate', value: e.target.value }), []);
  const handleEndDateChange = useCallback((e) => dispatch({ type: 'SET_FIELD', field: 'endDate', value: e.target.value }), []);
  const handleToastClose = useCallback(() => dispatch({ type: 'SET_FIELD', field: 'toast', value: { message: '', type: 'info' } }), []);
  const handleInTimeChangeFactory = useCallback((id) => (e) => handleInTimeChange(id, e.target.value), [handleInTimeChange]);
  const handleProcessBookingStillOutConfirmFactory = useCallback((id) => () => processBookingAction(id, 'confirm'), [processBookingAction]);

  // Add handler factories at the top of the component
  const handleProcessBookingConfirm = useCallback((id) => () => processBookingAction(id, 'confirm'), [processBookingAction]);
  const handleProcessBookingReject = useCallback((id) => () => processBookingAction(id, 'reject'), [processBookingAction]);
  const handleSaveInTimeFactory = useCallback((id) => () => handleSaveInTime(id), [handleSaveInTime]);
  const handleSendStillOutAlertFactory = useCallback((booking) => () => sendStillOutAlert(booking), [sendStillOutAlert]);

  if (loading && page === 0) return <div className="loading">Loading...<br/>{error && <span style={{color:'red'}}>{error}</span>}</div>;

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
        <List
          height={600}
          itemCount={filteredBookings.length + (hasMore ? 1 : 0)}
          itemSize={250} // Adjust as needed
          width={'100%'}
          itemData={{
            filteredBookings, selectedStatus, loading, banStatuses, editInTime, savingInTimeId,
            handleProcessBookingConfirm, handleProcessBookingReject, handleSaveInTimeFactory,
            handleSendStillOutAlertFactory, handleInTimeChangeFactory, handleProcessBookingStillOutConfirmFactory,
            hasMore
          }}
          onScroll={({ scrollDirection, scrollOffset }) => {
            if (scrollDirection === 'forward' && scrollOffset > (filteredBookings.length - 5) * 250) {
              loadMoreBookings();
            }
          }}
        >
          {BookingRow}
        </List>
      ) : (
        <div className="no-bookings">No {selectedStatus} requests available</div>
      )}
    </div>
  );
};

export default PendingBookings; 