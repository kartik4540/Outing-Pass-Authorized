import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleBookingAction, fetchBookingsFiltered, updateBookingInTime, fetchAllBans, extendOutingTime } from '../services/api';
import { supabase } from '../supabaseClient';
import { getWardenContext } from '../utils/wardenHostels';
import { safeParseSessionItem } from '../utils/sessionStorage';
import './PendingBookings.css';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
const PendingBookings = ({ adminRole, adminHostels, isWarden, wardenHostels: propWardenHostels }) => {
  const [allBookings, setAllBookings] = useState([]); // Store all bookings (unfiltered)
  const [selectedStatus, setSelectedStatus] = useState('waiting');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [counts, setCounts] = useState({ waiting: 0, still_out: 0, confirmed: 0, rejected: 0 });
  const [editInTime, setEditInTime] = useState({});
  const [savingInTimeId, setSavingInTimeId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [user, setUser] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  // lateOnly toggle removed; Still Out always shows only late students
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const navigate = useNavigate();
  const [banStatuses, setBanStatuses] = useState({}); // { student_email: banObject or null }
  const [rejectionModal, setRejectionModal] = useState({ open: false, bookingId: null });
  const [rejectionReason, setRejectionReason] = useState('');
  const [wardenNameModal, setWardenNameModal] = useState({ open: false, bookingId: null, action: null });
  const [wardenName, setWardenName] = useState('');
  const [extendModal, setExtendModal] = useState({ open: false, bookingId: null, inDate: '', inTime: '' });
  const [extendReason, setExtendReason] = useState('');
  const [extendSaving, setExtendSaving] = useState(false);
  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  // Warden session support (centralized)
  const { wardenLoggedIn, wardenHostels, wardenEmail } = getWardenContext(propWardenHostels);
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
  const fetchAllBookings = useCallback(async (adminEmail, statusOverride) => {
    try {
      setLoading(true);
      let allowedHostels;
      if (wardenLoggedIn) {
        allowedHostels = wardenHostels
          .filter(h => h && h.trim())
          .map(h => h.trim());
        if (allowedHostels.length === 0) {
          setAllBookings([]);
          setTotal(0);
          setLoading(false);
          return;
        }
      }
      // Apply a default 7-day window for Still Out to avoid huge scans unless user filters/searches
      const defaultStartForStillOut = startDate;
      const effectiveStatus = statusOverride || selectedStatus;
      const isStillOut = effectiveStatus === 'still_out';
      // For non-Still Out tabs without date filters, default to last 30 days to prevent timeout
      // For Still Out tab, default to last 1 month to avoid showing very old records
      let effectiveStartDate = startDate;
      let effectiveEndDate = endDate;
      if (!searchActive) {
        if (isStillOut && !startDate && !endDate) {
          // Still Out: Show only records from last 1 month on initial load
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          effectiveStartDate = oneMonthAgo.toISOString().split('T')[0];
          effectiveEndDate = new Date().toISOString().split('T')[0];
        } else if (!isStillOut && !startDate && !endDate) {
          // Other tabs: Default to last 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          effectiveStartDate = thirtyDaysAgo.toISOString().split('T')[0];
          effectiveEndDate = new Date().toISOString().split('T')[0];
        }
      }
      const { rows, count } = await fetchBookingsFiltered({
        status: effectiveStatus,
        // For Still Out on initial load: filter to last 1 month. For searches: ignore date filters.
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        allowedHostels,
        searchRoom: searchActive ? searchQuery : undefined,
        page: isStillOut ? 1 : page,
        pageSize: isStillOut ? 200 : pageSize, // Reduced from 1000 to 200
        includeCount: false,
        minimal: true,
        lateOnly: false // Show ALL records, not just late ones (LATE badge will still display on cards)
      });
      if (!Array.isArray(rows)) {
        setError('Supabase returned non-array data: ' + JSON.stringify(rows));
        setLoading(false);
        return;
      }
      setAllBookings(rows);
      // For Still Out, show all (no pagination). Otherwise approximate total.
      if (isStillOut) {
        setTotal(rows?.length || 0);
      } else {
        setTotal(count || (rows?.length || 0) + ((page - 1) * pageSize));
      }
      // Calculate counts from current page (approximate)
      const waiting = rows.filter(booking => booking.status === 'waiting').length;
      const still_out = rows.filter(booking => booking.status === 'still_out').length;
      const confirmed = rows.filter(booking => booking.status === 'confirmed').length;
      const rejected = rows.filter(booking => booking.status === 'rejected').length;
      setCounts({ waiting, still_out, confirmed, rejected });
      setError(null);
      await fetchBans();
    } catch (error) {
      const msg = String(error.message || '');
      const timeoutHint = msg.includes('statement timeout') ? ' Tip: Narrow the date range or use search to reduce results.' : '';
      setError('Failed to fetch bookings: ' + msg + timeoutHint);
    } finally {
      setLoading(false);
    }
  }, [fetchBans, wardenLoggedIn, isWarden, wardenHostels, selectedStatus, startDate, endDate, searchQuery, searchActive, page, pageSize]);
  const searchBookings = useCallback(async (roomNumber) => {
    if (!roomNumber || roomNumber.trim().length < 3) {
      setAllBookings([]);
      setSearchActive(false);
      return;
    }
    try {
      setLoading(true);
      setPage(1);
      const allowedHostels = wardenLoggedIn ? wardenHostels : undefined;
      const isStillOut = selectedStatus === 'still_out';
      const { rows, count } = await fetchBookingsFiltered({
        status: selectedStatus,
        // When searching by room, ignore date filters to search across all history
        startDate: undefined,
        endDate: undefined,
        allowedHostels,
        searchRoom: roomNumber,
        page: 1,
        pageSize: isStillOut ? 200 : 500, // Increased limit for searches
        lateOnly: false  // When searching, show ALL still_out records (not just late ones)
      });
      setAllBookings(rows || []);
      setTotal(isStillOut ? (rows?.length || 0) : (count || 0));
      setSearchActive(true);
      setError(null);
    } catch (error) {
      const msg = String(error.message || '');
      const timeoutHint = msg.includes('statement timeout') ? ' Tip: Narrow the date range or refine the room number.' : '';
      setError('Failed to search bookings: ' + msg + timeoutHint);
    } finally {
      setLoading(false);
    }
  }, [wardenEmail, user?.email, wardenHostels, wardenLoggedIn, selectedStatus, startDate, endDate, pageSize]);
  const checkAdminAndFetchBookings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) {
        navigate('/login');
        return;
      }
      if (!adminRole && !isWarden) {
        navigate('/');
        return;
      }
      await fetchAllBookings(user.email);
    } catch (error) {
      setError('Failed to authenticate');
    }
  }, [navigate, adminRole, isWarden, fetchAllBookings]);
  useEffect(() => {
    // Initialize user authentication only once
    if (wardenLoggedIn) {
      // For wardens, only load data on initial mount
      if (selectedStatus === 'waiting') {
        loadWaitingData();
      } else if (selectedStatus === 'still_out') {
        fetchAllBookings(wardenEmail, 'still_out');
      }
    } else {
      // For admins, only load data on initial mount
      if (selectedStatus === 'waiting' || selectedStatus === 'still_out') {
        checkAdminAndFetchBookings();
      }
    }
  }, [wardenLoggedIn]); // Removed selectedStatus from dependencies to prevent auto-reloading
  const loadWaitingData = useCallback(async () => {
    try {
      setLoading(true);
      setPage(1);
      const allowedHostels = wardenLoggedIn ? wardenHostels : undefined;
      const today = new Date().toISOString().split('T')[0];
      const { rows, count } = await fetchBookingsFiltered({
        status: 'waiting',
        startDate: today,
        endDate: today,
        allowedHostels,
        page: 1,
        pageSize
      });
      setAllBookings(rows || []);
      setTotal(count || 0);
      setError(null);
    } catch (error) {
      setError('Failed to load waiting data: ' + (error.message || JSON.stringify(error)));
    } finally {
      setLoading(false);
    }
  }, [wardenEmail, user?.email, wardenHostels, wardenLoggedIn, pageSize]);
  const handleStatusChange = useCallback((status) => {
    setSelectedStatus(status);
    setSearchQuery('');
    setSearchActive(false);
    setPage(1);
    // No late-only toggle; Still Out always shows late students
    // Auto-load data for "still_out" tab as it needs real-time updates for late comers
    // Manual refresh for other tabs to prevent unnecessary API calls
    if (status === 'still_out') {
      if (wardenLoggedIn) {
        fetchAllBookings(wardenEmail, 'still_out');
      } else {
        fetchAllBookings(user?.email, 'still_out');
      }
    } else {
      // For other tabs, clear data and let user manually refresh
      setAllBookings([]);
    }
  }, [wardenLoggedIn, wardenEmail, user?.email, fetchAllBookings]);
  const handleWardenAction = useCallback((bookingId, action) => {
    if (wardenLoggedIn) {
      // For wardens, show name input popup
      setWardenNameModal({ open: true, bookingId, action });
    } else {
      // For super admins, proceed directly
      processBookingAction(bookingId, action, null);
    }
  }, [wardenLoggedIn]);
  const handleWardenNameSubmit = useCallback(async () => {
    if (!wardenName.trim()) {
      setError('Please enter your name');
      return;
    }
    setWardenNameModal({ open: false, bookingId: null, action: null });
    await processBookingAction(wardenNameModal.bookingId, wardenNameModal.action, null, wardenName);
    setWardenName('');
  }, [wardenName, wardenNameModal]);
  const processBookingAction = useCallback(async (bookingId, action, reason, wardenName = null) => {
    try {
      setLoading(true);
      let emailToUse = null;
      if (wardenLoggedIn) {
        // For wardens, use the provided warden name or the session-resolved username
  const sessionWardenUser = safeParseSessionItem('wardenUsername') || null; // fallback for legacy
  emailToUse = wardenName || sessionWardenUser || (wardenEmail ? wardenEmail.split('@')[0] : null);
      } else {
        // For super admins, use their email
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
      // Force refresh the page data
      setAllBookings([]);
      setTimeout(() => {
        fetchAllBookings(emailToUse);
      }, 100);
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
      setError(`Failed to process booking action: ${error.message}`);
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
    let statusFiltered = allBookings.filter(booking => 
      (booking.status || '').toLowerCase() === selectedStatus.toLowerCase()
    );
    // For wardens, apply hostel permissions
    if (wardenLoggedIn && wardenEmail) {
      const allowedHostelsList = Array.isArray(wardenHostels) ? wardenHostels.map(h => h.trim().toLowerCase()) : [];
      // If warden has no hostels assigned or empty hostels list, show nothing
      if (allowedHostelsList.length === 0) {
        return [];
      }
      statusFiltered = statusFiltered.filter(booking => {
        // Check if booking belongs to warden's assigned hostel
        const bookingHostel = (booking.hostel_name || '').trim().toLowerCase();
        return allowedHostelsList.includes(bookingHostel);
      });
    }
    // For non-warden admins with hostel restrictions
    if (!wardenLoggedIn && adminRole === 'warden' && Array.isArray(adminHostels) && adminHostels.length > 0) {
      const normalizedHostels = adminHostels.map(h => h.trim().toLowerCase());
      statusFiltered = statusFiltered.filter(booking => {
        const bookingHostel = (booking.hostel_name || '').trim().toLowerCase();
        return normalizedHostels.includes('all') || normalizedHostels.includes(bookingHostel);
      });
    }
    return statusFiltered;
  }, [allBookings, selectedStatus, wardenLoggedIn, wardenHostels, wardenEmail, adminRole, adminHostels]);
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
    if ((booking.status || '').toLowerCase() !== 'still_out') return false;
    if (!booking.in_date || !booking.in_time) return false;
    const expectedReturnLocal = new Date(`${booking.in_date}T${booking.in_time}`);
    return new Date() > expectedReturnLocal;
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
  // Bookings filtered by hostel/warden/admin AND search (no date filter for Still Out)
  const filteredBookings = useMemo(() => {
    let base = hostelFilteredBookings;
    // Note: When searching room numbers on Still Out tab, show ALL still_out records (not just late ones)
    // The "LATE" badge will still appear on cards where applicable
    let filtered = base.filter(booking => {
      // Do not apply date range to Still Out
      if (selectedStatus === 'still_out') return true;
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
        booking.room_number && booking.room_number.toLowerCase().includes(query)
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
      // Send alert email using template
      const functionUrl = 'https://fwnknmqlhlyxdeyfcrad.supabase.co/functions/v1/send-email';
      const emailRes = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: booking.parent_email,
          template: 'still_out',
          booking: booking
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
  const openExtendModal = useCallback((booking) => {
    setExtendModal({
      open: true,
      bookingId: booking.id,
      inDate: booking.in_date || '',
      inTime: booking.in_time || ''
    });
    setExtendReason('');
  }, []);
  const handleExtendSubmit = useCallback(async () => {
    if (!extendModal.inDate || !extendModal.inTime) {
      setToast({ message: 'Please select both new In Date and In Time.', type: 'error' });
      return;
    }
    if (!extendReason.trim()) {
      setToast({ message: 'Please enter a reason for the extension.', type: 'error' });
      return;
    }
    setExtendSaving(true);
    try {
      const extendedBy = wardenLoggedIn
        ? (safeParseSessionItem('wardenUsername') || (wardenEmail ? wardenEmail.split('@')[0] : 'warden'))
        : (user?.email || 'admin');
      await extendOutingTime(extendModal.bookingId, extendModal.inDate, extendModal.inTime, extendReason.trim(), extendedBy);
      setExtendModal({ open: false, bookingId: null, inDate: '', inTime: '' });
      setExtendReason('');
      setToast({ message: 'Return time extended successfully.', type: 'info' });
      if (wardenLoggedIn) {
        await fetchAllBookings(wardenEmail, 'still_out');
      } else {
        await fetchAllBookings(user?.email, 'still_out');
      }
    } catch (error) {
      setToast({ message: 'Failed to extend: ' + (error.message || 'Unknown error'), type: 'error' });
    } finally {
      setExtendSaving(false);
    }
  }, [extendModal, extendReason, wardenLoggedIn, wardenEmail, user?.email, fetchAllBookings]);
  const handleExtendModalClose = useCallback(() => {
    setExtendModal({ open: false, bookingId: null, inDate: '', inTime: '' });
    setExtendReason('');
  }, []);
  const handleStatusChangeFactory = useCallback((status) => () => handleStatusChange(status), [handleStatusChange]);
  const handleStartDateChange = useCallback((e) => { setStartDate(e.target.value); setPage(1); }, []);
  const handleEndDateChange = useCallback((e) => { setEndDate(e.target.value); setPage(1); }, []);
  const handleToastClose = useCallback(() => setToast({ message: '', type: 'info' }), []);
  const handleInTimeChangeFactory = useCallback((id) => (e) => handleInTimeChange(id, e.target.value), [handleInTimeChange]);
  const handleProcessBookingStillOutConfirmFactory = useCallback((id) => () => processBookingAction(id, 'confirm'), [processBookingAction]);
  // Search handlers
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchQuery(value);
    // Clear results if less than 3 characters
    if (value.length < 3) {
      setAllBookings([]);
      setSearchActive(false);
    }
  }, []);
  const handleSearchKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && searchQuery.trim().length >= 3) {
      searchBookings(searchQuery.trim());
    }
  }, [searchQuery, searchBookings]);
  const handleSearchClick = useCallback(() => {
    if (searchQuery.trim().length >= 3) {
      searchBookings(searchQuery.trim());
    }
  }, [searchQuery, searchBookings]);
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchActive(false);
    setAllBookings([]);
  }, []);
  // Download report as Excel-compatible CSV with date filtering
  const handleDownloadReport = useCallback(async () => {
    try {
      setLoading(true);
      // Validate date range
      if (!startDate || !endDate) {
        setToast({ message: 'Please select both Start Date and End Date for the report', type: 'warning' });
        setLoading(false);
        return;
      }
      // Fetch all bookings within date range (not filtered by status or pagination)
      let allowedHostels;
      if (wardenLoggedIn) {
        allowedHostels = wardenHostels
          .filter(h => h && h.trim())
          .map(h => h.trim());
        if (allowedHostels.length === 0) {
          setToast({ message: 'No hostels assigned to your account', type: 'warning' });
          setLoading(false);
          return;
        }
      }
      // Fetch all bookings for the date range
      const { rows: reportBookings } = await fetchBookingsFiltered({
        status: null,
        startDate: startDate,
        endDate: endDate,
        allowedHostels: wardenLoggedIn ? allowedHostels : null,
        page: 1,
        pageSize: 10000,
        searchRoom: null,
        minimal: false
      });
      if (!reportBookings || reportBookings.length === 0) {
        setToast({ message: 'No bookings found for the selected date range', type: 'warning' });
        setLoading(false);
        return;
      }
      // CSV Headers for Excel
      const headers = [
        'Booking ID',
        'Student Name',
        'Email',
        'Room Number',
        'Hostel',
        'Out Time',
        'Expected In Time',
        'Actual In Time',
        'Status',
        'Reason',
        'Handled By',
        'Handled At',
        'Created At',
        'Updated At'
      ];
      // Convert bookings to CSV rows
      const rows = reportBookings.map(booking => {
        // Combine date and time for display
        const outDateTime = booking.out_date && booking.out_time 
          ? `${booking.out_date} ${booking.out_time}` 
          : '';
        const inDateTime = booking.in_date && booking.in_time 
          ? `${booking.in_date} ${booking.in_time}` 
          : '';
        
        return [
          booking.id || '',
          booking.name || '',
          booking.email || '',
          booking.room_number || '',
          booking.hostel_name || '',
          outDateTime,
          inDateTime,
          booking.actual_in_time ? new Date(booking.actual_in_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
          booking.status || '',
          booking.reason ? `"${booking.reason.replace(/"/g, '""')}"` : 'No reason provided',
          booking.handled_by || '',
          booking.handled_at ? new Date(booking.handled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
          booking.created_at ? new Date(booking.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
          booking.updated_at ? new Date(booking.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''
        ];
      });
      // Create CSV content with UTF-8 BOM for Excel compatibility
      const csvContent = '\uFEFF' + [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      // Generate filename with date range and hostel info
      const hostelInfo = wardenLoggedIn ? `_${allowedHostels.join('-')}` : '_All';
      const filename = `Outing_Report${hostelInfo}_${startDate}_to_${endDate}.csv`;
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setToast({ message: `Report generated: ${reportBookings.length} bookings downloaded`, type: 'success' });
      setLoading(false);
    } catch (error) {
      console.error('Error generating report:', error);
      setToast({ message: 'Failed to generate report: ' + (error.message || 'Unknown error'), type: 'error' });
      setLoading(false);
    }
  }, [startDate, endDate, wardenLoggedIn, wardenHostels, user?.email]);
  // Add handler factories at the top of the component
  const handleProcessBookingConfirm = useCallback((id) => () => handleWardenAction(id, 'confirm'), [handleWardenAction]);
  const handleProcessBookingReject = useCallback((id) => () => {
    if (wardenLoggedIn) {
      handleWardenAction(id, 'reject');
    } else {
      setRejectionModal({ open: true, bookingId: id });
    }
  }, [wardenLoggedIn, handleWardenAction]);
  const handleRejectionSubmit = async () => {
    await processBookingAction(rejectionModal.bookingId, 'reject', rejectionReason);
    setRejectionModal({ open: false, bookingId: null });
    setRejectionReason('');
  };
  const handleSaveInTimeFactory = useCallback((id) => () => handleSaveInTime(id), [handleSaveInTime]);
  const handleSendStillOutAlertFactory = useCallback((booking) => () => sendStillOutAlert(booking), [sendStillOutAlert]);
  if (loading) return <div className="loading">Loading...<br/>{error && <span style={{color:'red'}}>{error}</span>}</div>;
  // Add error boundary to prevent white screen
  if (error && !allBookings.length) {
    return (
      <div className="pending-bookings-page">
        <h2>Outing Requests</h2>
        <div className="error-message" style={{color: 'red', padding: '20px', textAlign: 'center'}}>
          {error}
        </div>
        <button onClick={() => window.location.reload()} style={{margin: '10px', padding: '10px'}}>
          Retry
        </button>
      </div>
    );
  }
  // Always render something to prevent white screen
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
        <div className="search-container">
          <div className="search-input-group">
            <label>Search by Room Number:</label>
            <input 
              type="text" 
              className="search-input"
              placeholder={`Enter room number to search ${selectedStatus} bookings...`}
              value={searchQuery} 
              onChange={handleSearchChange}
              onKeyPress={handleSearchKeyPress}
            />
          </div>
          <button 
            className="search-button"
            onClick={handleSearchClick}
            disabled={searchQuery.trim().length < 3}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '8px 12px', backgroundColor: '#f8f9fa', borderRadius: 6, border: '1px solid #dee2e6' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: '#495057' }}>Report Start Date:</label>
            <input type="date" value={startDate} onChange={handleStartDateChange} style={{ marginLeft: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: '#495057' }}>Report End Date:</label>
            <input type="date" value={endDate} onChange={handleEndDateChange} style={{ marginLeft: 4 }} />
          </div>
          <button 
            className="download-button report-button"
            onClick={handleDownloadReport}
            disabled={!startDate || !endDate || loading}
            title={!startDate || !endDate ? "Select date range to generate report" : "Generate and download report for selected date range"}
            style={{ marginLeft: 8 }}
          >
            📥 Generate Report
          </button>
        </div>
        {/* Late-only checkbox removed: always showing late students in Still Out */}
      </div>
      {(!startDate || !endDate) && (
        <div className="report-info-message">
          ℹ️ Select Report Start Date and Report End Date to generate a comprehensive report of all bookings in that period
        </div>
      )}
      {searchActive && (
        <div className="search-active-indicator">
          🔍 Searching for room number: <strong>{searchQuery}</strong> ({filteredBookings.length} results found)
        </div>
      )}
      {!searchActive && selectedStatus === 'waiting' && (
        <div style={{ marginBottom: 16, padding: 16, backgroundColor: '#fff3cd', borderRadius: 4, textAlign: 'center' }}>
          <p><strong>Waiting Area:</strong> Showing today's pending requests only. Use search to find older requests by room number.</p>
        </div>
      )}
      {!searchActive && selectedStatus === 'confirmed' && (
        <div style={{ marginBottom: 16, padding: 16, backgroundColor: '#d1ecf1', borderRadius: 4, textAlign: 'center' }}>
          <p><strong>Confirmed Bookings:</strong> Enter a room number to search for confirmed bookings.</p>
        </div>
      )}
      {!searchActive && selectedStatus === 'rejected' && (
        <div style={{ marginBottom: 16, padding: 16, backgroundColor: '#f8d7da', borderRadius: 4, textAlign: 'center' }}>
          <p><strong>Rejected Bookings:</strong> Enter a room number to search for rejected bookings.</p>
        </div>
      )}
      {!searchActive && selectedStatus === 'still_out' && (
        <div style={{ marginBottom: 16, padding: 16, backgroundColor: '#f8d7da', borderRadius: 4, textAlign: 'center' }}>
          <p><strong>Still Out - Late Students:</strong> Showing students whose expected return time has passed (last 7 days). Use room number search or date filters to find older records.</p>
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
                  <p><strong>Reason:</strong> <span className="reason-text">{booking.reason ? booking.reason : 'No reason provided'}</span></p>
                  {booking.handled_by && booking.status !== 'waiting' && (
                    <p className="handled-time">
                      <strong>Handled on:</strong> {booking.handled_at ? new Date(booking.handled_at).toLocaleString() : ''}
                      <br />
                      <strong>Handled by:</strong> {booking.handled_by}
                    </p>
                  )}
                  {booking.extension_count > 0 && (
                    <p className="handled-time">
                      <strong>Extended ({booking.extension_count}/2) by:</strong> {booking.extended_by}
                      <br />
                      <strong>Extended on:</strong> {booking.extended_at ? new Date(booking.extended_at).toLocaleString() : ''}
                      <br />
                      <strong>Extension Reason:</strong> {booking.extension_reason || 'N/A'}
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
                  {(booking.extension_count || 0) < 2 && (
                    <button onClick={() => openExtendModal(booking)} className="alert-btn">Extend</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="no-bookings" style={{ textAlign: 'center', padding: '20px' }}>
          <p>No {selectedStatus} requests available</p>
          {/* Only show refresh button for tabs that don't auto-load */}
          {selectedStatus !== 'still_out' && (
            <button 
              onClick={() => {
                if (selectedStatus === 'waiting') {
                  loadWaitingData();
                } else if (selectedStatus === 'confirmed' || selectedStatus === 'rejected') {
                  // For confirmed/rejected, show search message instead
                  setSearchQuery('');
                  setSearchActive(false);
                }
              }}
              style={{
                background: '#007bff',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              Refresh {selectedStatus} Data
            </button>
          )}
          {selectedStatus === 'still_out' && (
            <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              Still Out auto-loads and shows only late students across all dates.
            </p>
          )}
        </div>
      )}
      {/* Pagination controls (hidden for Still Out) */}
      {selectedStatus !== 'still_out' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
          <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>Next</button>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
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
      {wardenNameModal.open && (
        <Modal onClose={() => setWardenNameModal({ open: false, bookingId: null, action: null })}>
          <h3>Enter Your Name</h3>
          <p>Please enter your name for the booking action:</p>
          <input
            type="text"
            value={wardenName}
            onChange={e => setWardenName(e.target.value)}
            placeholder="Enter your name..."
            style={{ width: '100%', padding: 8, marginBottom: 16, border: '1px solid #ccc', borderRadius: 4 }}
          />
          <button 
            onClick={handleWardenNameSubmit} 
            style={{ 
              background: wardenNameModal.action === 'confirm' ? '#28a745' : '#dc3545', 
              color: 'white', 
              marginRight: 8 
            }}
          >
            {wardenNameModal.action === 'confirm' ? 'Confirm' : 'Reject'}
          </button>
          <button onClick={() => setWardenNameModal({ open: false, bookingId: null, action: null })}>Cancel</button>
        </Modal>
      )}
      {extendModal.open && (
        <Modal onClose={handleExtendModalClose}>
          <h3>Extend Return Time</h3>
          <p style={{ fontSize: '0.9em', color: '#666' }}>
            This booking can be extended up to 2 times. Extensions used so far will be shown on the student's card.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="extend-in-date" style={{ display: 'block', marginBottom: 4 }}><strong>New In Date:</strong></label>
            <input
              id="extend-in-date"
              type="date"
              value={extendModal.inDate}
              onChange={e => setExtendModal(prev => ({ ...prev, inDate: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="extend-in-time" style={{ display: 'block', marginBottom: 4 }}><strong>New In Time:</strong></label>
            <input
              id="extend-in-time"
              type="time"
              value={extendModal.inTime}
              onChange={e => setExtendModal(prev => ({ ...prev, inTime: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </div>
          <textarea
            value={extendReason}
            onChange={e => setExtendReason(e.target.value)}
            placeholder="Enter reason for extension..."
            style={{ width: '100%', minHeight: 60, marginBottom: 16 }}
          />
          <button onClick={handleExtendSubmit} disabled={extendSaving} style={{ background: '#28a745', color: 'white', marginRight: 8 }}>
            {extendSaving ? 'Saving...' : 'Save Extension'}
          </button>
          <button onClick={handleExtendModalClose} disabled={extendSaving}>Cancel</button>
        </Modal>
      )}
    </div>
  );
};
export default PendingBookings; 
