import { supabase } from '../supabaseClient';
import { normalizeHostels as normalizeHostelsList, getWardenContext } from '../utils/wardenHostels';
import { getStatusUpdateEmail, getNowOutEmail, getReturnedEmail } from './mailTemplates';
import * as XLSX from 'xlsx';

// No longer need API_BASE_URL as we're using Supabase directly

/**
 * Helper function to handle errors
 * @param {Error} error - The error object
 * @returns {Error} - Formatted error
 */
const handleError = (error) => {
  return new Error(error.message || 'An error occurred with the Supabase request');
};


/**
 * Book a lab slot
 * @param {Object} bookingData - The booking data
 * @returns {Promise<Object>} - Booking confirmation
 */
export const bookSlot = async (bookingData) => {
  try {
    // Validate required fields
    if (!bookingData.name || !bookingData.email || !bookingData.hostelName || !bookingData.roomNumber || !bookingData.outDate || !bookingData.outTime || !bookingData.inDate || !bookingData.inTime || !bookingData.reason) {
      throw new Error('Missing required fields: name, email, hostel, room number, out date/time, in date/time, reason are required.');
    }

    // Insert the outing request into the database
    const { data, error } = await supabase
      .from('outing_requests')
      .insert([
        {
          name: bookingData.name,
          email: bookingData.email,
          hostel_name: bookingData.hostelName,
          room_number: bookingData.roomNumber,
          out_date: bookingData.outDate,
          out_time: bookingData.outTime,
          in_date: bookingData.inDate,
          in_time: bookingData.inTime,
          parent_email: bookingData.parentEmail,
          parent_phone: bookingData.parentPhone, // NEW: include parent_phone
          reason: bookingData.reason,
          status: 'waiting'
        }
      ])
      .select();

    if (error) throw error;

    return {
      success: true,
      message: 'Outing request submitted successfully!',
      booking: data[0]
    };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Fetch booked slots for a user
 * @param {string} email - The user's email
 * @returns {Promise<Array>} - Array of booked slots with counts
 */
export const fetchBookedSlots = async (email, opts = { limit: 50, minimal: true }) => {
  try {
    const limit = opts.limit ?? 50;
    const minimal = opts.minimal ?? true;
    const columns = minimal
      ? [
          'id','status','out_date','out_time','in_date','in_time','reason',
          'handled_by','handled_at','otp','otp_used','created_at'
        ].join(',')
      : '*';

    const { data, error } = await supabase
      .from('outing_requests')
      .select(columns)
      .eq('email', email)
      .order('created_at', { ascending: false })
      .range(0, Math.max(0, limit - 1));
    
    if (error) throw error;
    const rows = data || [];
    
    // Calculate counts for each status within the fetched window (approximate)
    const waiting = rows.filter(booking => booking.status === 'waiting').length;
    const confirmed = rows.filter(booking => booking.status === 'confirmed').length;
    const rejected = rows.filter(booking => booking.status === 'rejected').length;
    
    rows.counts = { waiting, confirmed, rejected };
    return rows;
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Delete a booked slot
 * @param {number} slotId - The slot ID to delete
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteBookedSlot = async (slotId) => {
  try {
    const { error } = await supabase
      .from('outing_requests')
      .delete()
      .eq('id', slotId)
      .select();
    
    if (error) throw error;
    
    return { success: true, message: 'Booking deleted successfully' };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Fetch all bookings (admin/warden)
 * Optionally restrict by allowed hostels (for wardens)
 * @param {string} adminEmail - The admin's email (for audit/compat)
 * @param {string[]} allowedHostels - Optional list of hostel names the user is allowed to see; if ['all'] or empty/undefined => no restriction
 * @returns {Promise<Array>} - Array of bookings
 */
export const fetchPendingBookings = async (adminEmail, allowedHostels) => {
  try {
    // Select only columns needed by the admin UI to reduce payload
    const pendingCols = [
      'id', 'name', 'email', 'hostel_name', 'room_number', 'parent_email', 'parent_phone',
      'status', 'out_date', 'out_time', 'in_date', 'in_time', 'reason', 'handled_by', 'handled_at', 'created_at'
    ].join(',');

    let query = supabase
      .from('outing_requests')
      .select(pendingCols)
      .order('out_date', { ascending: false })
      .order('created_at', { ascending: false });

    // Normalize allowedHostels (trim, remove empties). Treat 'all' case-insensitively.
    const normalizedHostels = normalizeHostelsList(allowedHostels);
    const hasAll = normalizedHostels.map(h => typeof h === 'string' ? h.toLowerCase() : '').includes('all');
    if (Array.isArray(normalizedHostels) && normalizedHostels.length > 0 && !hasAll) {
      query = query.in('hostel_name', normalizedHostels);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch outing requests: ${error.message}`);
    }

    // If no rows found, return empty array (don't throw) — callers expect [] in many UI flows
    if (!data || data.length === 0) {
      return [];
    }

    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Fetch bookings with server-side filters and pagination
 * @param {Object} opts
 * @param {string} [opts.status] - Filter by status: waiting|still_out|confirmed|rejected
 * @param {string} [opts.startDate] - Inclusive start date (YYYY-MM-DD) for out_date
 * @param {string} [opts.endDate] - Inclusive end date (YYYY-MM-DD) for out_date
 * @param {string[]} [opts.allowedHostels] - Hostels restriction (warden scope)
 * @param {string} [opts.searchRoom] - Case-insensitive room number search (prefix/substring)
 * @param {number} [opts.page] - 1-based page number
 * @param {number} [opts.pageSize] - Page size (default 50)
 * @returns {Promise<{rows: any[], count: number, page: number, pageSize: number}>}
 */
export const fetchBookingsFiltered = async (opts = {}) => {
  const {
    status,
    startDate,
    endDate,
    allowedHostels,
    searchRoom,
    page = 1,
    pageSize = 50,
    includeCount = false,
    minimal = true,
    lateOnly = false
  } = opts;

  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Select only the columns required by PendingBookings to reduce IO
    const columns = minimal
      ? [
          'id',
          'name',
          'email',
          'hostel_name',
          'room_number',
          'parent_email',
          'parent_phone',
          'status',
          'out_date',
          'out_time',
          'in_date',
          'in_time',
          'reason',
          'handled_by',
          'handled_at',
          'extension_count',
          'extension_reason',
          'extended_by',
          'extended_at'
        ].join(',')
      : '*';

    let query = supabase
      .from('outing_requests')
      .select(columns, { count: includeCount ? 'planned' : undefined })
      .order('out_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('out_date', startDate);
    }
    if (endDate) {
      query = query.lte('out_date', endDate);
    }

    if (lateOnly) {
      // Optimize: For "still_out" late students, enforce recent date range to avoid full scan
      // Show only out_date within last 7 days (aggressive optimization)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const minDate = sevenDaysAgo.toISOString().split('T')[0];
      query = query.gte('out_date', minDate);
      
      // Late if expected return time (in_date + in_time) has passed current time
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const nowTime = now.toTimeString().slice(0, 8); // HH:MM:SS
      
      // Late condition: in_date < today OR (in_date == today AND in_time < nowTime)
      query = query.or(`in_date.lt.${today},and(in_date.eq.${today},in_time.lt.${nowTime})`);
    }

    // Normalize allowedHostels before applying .in()
    const normalizedHostels = normalizeHostelsList(allowedHostels);
    const hasAll = normalizedHostels.map(h => h.toLowerCase()).includes('all');
    if (Array.isArray(normalizedHostels) && normalizedHostels.length > 0 && !hasAll) {
      query = query.in('hostel_name', normalizedHostels);
    }

    if (searchRoom && searchRoom.trim().length >= 3) {
      const term = searchRoom.trim();
      if (/^\d+$/.test(term)) {
        // Exact numeric room match is fastest
        query = query.eq('room_number', term);
      } else {
        // Prefer prefix search to leverage indexes
        query = query.ilike('room_number', `${term}%`);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(`Failed to fetch outing requests: ${error.message}`);
    }
    return { rows: data || [], count: includeCount ? (count || 0) : 0, page, pageSize };
  } catch (error) {
    // Surface statement timeout hint
    if (String(error.message || '').includes('statement timeout')) {
      const hint = 'The query timed out. Try narrowing filters or reducing date range.';
      throw new Error(`${error.message}. ${hint}`);
    }
    throw handleError(error);
  }
};



function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Handle booking action (confirm/reject)
 * @param {number} bookingId - The booking ID to update
 * @param {string} action - The action to perform ('confirm' or 'reject')
 * @param {string} adminEmail - The admin's email
 * @returns {Promise<Object>} - Action confirmation
 */
export const handleBookingAction = async (bookingId, action, adminEmail, rejectionReason) => {
  try {
    // Validate handled_by (adminEmail used here as handler name) must be non-empty
    if (!adminEmail || !String(adminEmail).trim()) {
      throw new Error('Approver name is required');
    }
    // action is now the new status: 'still_out', 'confirmed', 'rejected'
    let newStatus = action;
    if (action === 'reject') newStatus = 'rejected';
    const updateObj = {
      status: newStatus,
      handled_by: adminEmail,
      handled_at: new Date().toISOString(),
    };
    if (newStatus === 'rejected') {
      updateObj.rejection_reason = rejectionReason || null;
    }
    const { data, error } = await supabase
      .from('outing_requests')
      .update(updateObj)
      .eq('id', bookingId)
      .select();
    if (error) {
      throw new Error(`Supabase error: ${error.message || error}`);
    }

    let emailResult = { sent: false, error: null };
    // --- AUTOMATED EMAIL TO PARENT ---
    if (data && data[0] && data[0].parent_email) {
      const booking = data[0];
      let emailTemplate;
      if (newStatus === 'still_out') {
        emailTemplate = getNowOutEmail(booking, adminEmail);
      } else if (newStatus === 'confirmed') {
        emailTemplate = getReturnedEmail(booking);
      } else if (newStatus === 'rejected') {
        emailTemplate = getStatusUpdateEmail(booking, 'rejected');
      }
      if (emailTemplate) {
      const functionUrl = 'https://fwnknmqlhlyxdeyfcrad.supabase.co/functions/v1/send-email';
      try {
        const emailRes = await fetch(functionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              to: booking.parent_email,
              subject: emailTemplate.subject,
              html: emailTemplate.html
          })
        });
        const emailData = await emailRes.json();
        if (emailRes.ok && !emailData.error) {
          emailResult.sent = true;
        } else {
          emailResult.error = emailData.error || 'Unknown error';
        }
      } catch (err) {
        emailResult.error = err.message || 'Failed to send email';
        }
      }
    }
    // --- END EMAIL ---

    return { 
      success: true, 
      message: `Booking ${newStatus} successfully`, 
      booking: data[0],
      emailResult
    };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Generate OTP for a booking only on the out date and only once
 * @param {number} bookingId - The booking ID
 * @returns {Promise<{otp: string}>}
 */
export const generateOtpForBooking = async (bookingId) => {
  try {
    // Use local date to avoid timezone issues
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { data: booking, error: fetchErr } = await supabase
      .from('outing_requests')
      .select('id, out_date, status, otp, otp_used')
      .eq('id', bookingId)
      .single();
    if (fetchErr) throw fetchErr;
    if (!booking) throw new Error('Booking not found');
    if (booking.out_date !== today) throw new Error(`OTP will be available on your out date only (Today: ${today}, Out Date: ${booking.out_date})`);
    // Ensure the student has been let out (approved)
    if ((booking.status || '').toLowerCase() !== 'still_out') {
      throw new Error('OTP can be generated after you are marked as Out by the warden');
    }
    // If an unused OTP already exists, reuse it
    if (booking.otp && booking.otp_used === false) {
      return { otp: booking.otp };
    }
    // Generate a unique OTP
    let otp = null;
    let unique = false;
    while (!unique) {
      otp = generateOTP();
      const { data: exists } = await supabase
        .from('outing_requests')
        .select('id')
        .eq('otp', otp);
      if (!exists || exists.length === 0) unique = true;
    }
    const { data: updated, error: updErr } = await supabase
      .from('outing_requests')
      .update({ otp, otp_used: false })
      .eq('id', bookingId)
      .select();
    if (updErr) throw updErr;
    return { otp: updated?.[0]?.otp || otp };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Update only the in_time field for a booking (admin only)
 * @param {number} bookingId - The booking ID to update
 * @param {string} newInTime - The new in_time value
 * @returns {Promise<Object>} - Update confirmation
 */
export const updateBookingInTime = async (bookingId, newInTime) => {
  try {
    const { data, error } = await supabase
      .from('outing_requests')
      .update({ in_time: newInTime })
      .eq('id', bookingId)
      .select();
    if (error) throw error;
    return {
      success: true,
      message: 'In Time updated successfully',
      booking: data[0]
    };
  } catch (error) {
    throw handleError(error);
  }
};

// Extends a Still Out student's expected return date/time, up to 2 times per booking.
export const extendOutingTime = async (bookingId, newInDate, newInTime, extensionReason, extendedBy) => {
  try {
    const { data: existingRows, error: fetchError } = await supabase
      .from('outing_requests')
      .select('extension_count, in_date, in_time')
      .eq('id', bookingId)
      .single();
    if (fetchError) throw fetchError;

    const currentCount = existingRows?.extension_count || 0;
    if (currentCount >= 2) {
      throw new Error('This booking has already been extended twice. No further extensions allowed.');
    }

    const updateObj = {
      in_date: newInDate,
      in_time: newInTime,
      extension_reason: extensionReason,
      extended_by: extendedBy,
      extended_at: new Date().toISOString(),
      extension_count: currentCount + 1
    };
    if (currentCount === 0) {
      updateObj.original_in_date = existingRows.in_date;
      updateObj.original_in_time = existingRows.in_time;
    }

    const { data, error } = await supabase
      .from('outing_requests')
      .update(updateObj)
      .eq('id', bookingId)
      .select();
    if (error) throw error;
    return {
      success: true,
      message: 'Return time extended successfully',
      booking: data[0]
    };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Add or update student info (upsert by student_email)
 * @param {Object} info - student info object
 * @returns {Promise<Object>} - inserted/updated row
 */
export async function addOrUpdateStudentInfo(info) {
  // Normalize only the fields we must canonicalize:
  // - lowercase student_email and parent_email for consistent equality
  // - trim other string fields but preserve case for display fields like hostel_name
  const normalized = Object.fromEntries(Object.entries(info).map(([k, v]) => {
    if (typeof v !== 'string') return [k, v];
    if (k === 'student_email' || k === 'parent_email') return [k, v.trim().toLowerCase()];
    return [k, v.trim()];
  }));
  const { data, error } = await supabase
    .from('student_info')
    .upsert([normalized], { onConflict: ['student_email'] });
  if (error) throw error;
  return data;
}

/**
 * Fetch all student info with optional hostel filtering
 * @param {string[]} allowedHostels - Optional list of hostel names to filter by
 * @returns {Promise<Array>} - Array of student info
 */
export const fetchAllStudentInfo = async (allowedHostels) => {
  try {
    // Select only commonly used columns to reduce payload
    const columns = ['id','student_email','hostel_name','parent_email','parent_phone','updated_by'].join(',');
    const query = supabase
      .from('student_info')
      .select(columns)
      .order('student_email', { ascending: true });
    
    // Apply server-side hostel restriction when provided
    // Normalize allowedHostels before applying .in()
    const normalizedHostels = normalizeHostelsList(allowedHostels);
    const hasAll = normalizedHostels.map(h => h.toLowerCase()).includes('all');
    if (Array.isArray(normalizedHostels) && normalizedHostels.length > 0 && !hasAll) {
      query.in('hostel_name', normalizedHostels);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Search student info with optional hostel filtering
 * @param {string} searchQuery - Search term (student email)
 * @param {string[]} allowedHostels - Optional list of hostel names to filter by
 * @returns {Promise<Array>} - Array of filtered student info
 */
export const searchStudentInfoWithHostels = async (
  searchQuery,
  allowedHostels,
  options = { page: 1, pageSize: 25, minimal: true, includeCount: false }
) => {
  try {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 25;
    const minimal = options.minimal ?? true;
    const includeCount = options.includeCount ?? false;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const columns = minimal
      ? ['id','student_email','hostel_name','parent_email','parent_phone','updated_by'].join(',')
      : '*';

    const term = (searchQuery || '').trim();

    // Fast path: first 6 characters uniquely identify local-part and all emails share the same domain
    if (term && !term.includes('@') && term.length >= 6) {
      const domain = 'srmist.edu.in';
      const pattern = `${term.toLowerCase()}%@${domain}`;
      let fastQuery = supabase
        .from('student_info')
        .select(columns)
        .ilike('student_email', pattern)
        .limit(5);

      // Normalize allowedHostels before applying .in()
      const fastHostels = normalizeHostelsList(allowedHostels);
      const fastHasAll = fastHostels.map(h => h.toLowerCase()).includes('all');
      if (Array.isArray(fastHostels) && fastHostels.length > 0 && !fastHasAll) {
        fastQuery = fastQuery.in('hostel_name', fastHostels);
      }

      const { data, error } = await fastQuery;
      if (error) throw error;
      return { rows: data || [], count: data?.length || 0, page: 1, pageSize: 5 };
    }

    // Exact email search path: use indexed equality, no sort, no pagination
    if (term && term.includes('@')) {
      let exactQuery = supabase
        .from('student_info')
        .select(columns)
        .eq('student_email', term.toLowerCase())
        .maybeSingle();

      if (Array.isArray(allowedHostels) && allowedHostels.length > 0) {
        // Normalize allowedHostels before applying .in()
        const exactHostels = normalizeHostelsList(allowedHostels);
        const exactHasAll = exactHostels.map(h => h.toLowerCase()).includes('all');
        if (Array.isArray(exactHostels) && exactHostels.length > 0 && !exactHasAll) {
          // When using maybeSingle, apply hostel filter via eq/in before maybeSingle by reconstructing query
          exactQuery = supabase
            .from('student_info')
            .select(columns)
            .eq('student_email', term.toLowerCase())
            .in('hostel_name', exactHostels)
            .maybeSingle();
        }
      }

      const { data, error } = await exactQuery;
      if (error) throw error;
      const rows = data ? [data] : [];
      return { rows, count: rows.length, page: 1, pageSize: 1 };
    }

    // Partial search path: substring with limit and optional count
    let query = supabase
      .from('student_info')
      .select(columns, { count: includeCount ? 'planned' : undefined })
      .order('student_email', { ascending: true })
      .range(from, to);

    if (term) {
      query = query.ilike('student_email', `%${term}%`);
    }

    const normalizedHostels2 = normalizeHostelsList(allowedHostels);
    const hasAll2 = normalizedHostels2.map(h => h.toLowerCase()).includes('all');
    if (Array.isArray(normalizedHostels2) && normalizedHostels2.length > 0 && !hasAll2) {
      query = query.in('hostel_name', normalizedHostels2);
    }
    
    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data || [], count: includeCount ? (count || 0) : 0, page, pageSize };
  } catch (error) {
    // If RLS blocks access, PostgREST often returns empty set without error; provide helpful hint
    if (String(error.message || '').includes('permission denied')) {
      throw new Error('Permission denied. Ensure your account is a super admin or warden with assigned hostels.');
    }
    throw handleError(error);
  }
};

/**
 * Generate and download Excel template for student info upload
 * @returns {Promise<void>}
 */
export const downloadStudentInfoTemplate = async () => {
  try {
    // Create template data with headers and example rows
    const templateData = [
      {
        'Student Email': 'student1@example.com',
        'Hostel Name': 'Hostel A',
        'Parent Email': 'parent1@example.com',
        'Parent Phone': '+91-9876543210'
      },
      {
        'Student Email': 'student2@example.com',
        'Hostel Name': 'Hostel B',
        'Parent Email': 'parent2@example.com',
        'Parent Phone': '+91-9876543211'
      },
      {
        'Student Email': 'student3@example.com',
        'Hostel Name': 'Hostel C',
        'Parent Email': 'parent3@example.com',
        'Parent Phone': '+91-9876543212'
      }
    ];

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Set column widths for better readability
    const columnWidths = [
      { wch: 25 }, // Student Email
      { wch: 15 }, // Hostel Name
      { wch: 25 }, // Parent Email
      { wch: 20 }  // Parent Phone
    ];
    worksheet['!cols'] = columnWidths;

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Info Template');

    // Generate the Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    
    // Create blob and download
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student_info_template.xlsx';
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Failed to generate template: ${error.message}`);
  }
};



/**
 * Fetch student info by email
 * @param {string} email - Student email
 * @returns {Promise<Object>} - Student info
 */
export const fetchStudentInfoByEmail = async (email) => {
  try {
    const columns = ['id','student_email','hostel_name','parent_email','parent_phone','updated_by'].join(',');
      const { data, error } = await supabase
        .from('student_info')
        .select(columns)
        .eq('student_email', email.toLowerCase())
        .maybeSingle();
    if (error && error.code === 'PGRST116') return null; // No row found is not an error
    if (error) throw error;
    return data;
  } catch (error) {
    return null;
  }
};

/**
 * Fetch admin info by email
 * @param {string} email
 * @returns {Promise<Object|null>} - Admin info or null if not found
 */
export const fetchAdminInfoByEmail = async (email) => {
  try {
    const cols = ['id','email','role'].join(',');
    const { data, error } = await supabase
      .from('admins')
      .select(cols)
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (error) {
    return null;
  }
};

/**
 * Fetch warden info by email
 * @param {string} email
 * @returns {Promise<Object|null>} - Warden info or null if not found
 */
export const fetchWardenInfoByEmail = async (email) => {
  try {
    const cols = ['id','email','hostels'].join(',');
    const { data, error } = await supabase
      .from('wardens')
      .select(cols)
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (error) {
    return null;
  }
};

/**
 * Delete student info by email (superadmin only)
 * @param {string} student_email - The student's email
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteStudentInfo = async (student_email) => {
  try {
    const { error } = await supabase
      .from('student_info')
      .delete()
      .eq('student_email', student_email.toLowerCase());
    if (error) throw error;
    return { success: true };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Authenticate warden by email (simple check like super admin)
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object|null>} - Warden info or null if not found/invalid
 */
export const authenticateWarden = async (email, password) => {
  try {
    // First authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password: password
    });
    
    if (authError || !authData.user) {
      return null;
    }
    
    // Check if user exists in wardens table (like super admin check)
    // Wardens table does not expose `name` in the public REST schema; select safe fields.
    const { data, error } = await supabase
      .from('wardens')
      .select('id,email,hostels')
      .eq('email', email.toLowerCase())
      .single();
      
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    
    return { ...data, role: 'warden' }; // Add role for compatibility
  } catch (error) {
    return null;
  }
};

/**
 * Check if user is arch gate (after Gmail login)
 * @param {string} email
 * @returns {Promise<Object|null>} - Arch gate info or null if not found
 */
export const checkArchGateStatus = async (email) => {
  try {
    const { data, error } = await supabase
      .from('arch_gate')
      .select('id,email')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    return { ...data, role: 'arch_gate' };
  } catch (error) {
    return null;
  }
};



// Health check function checks if we can connect to Supabase
export const checkApiHealth = async () => {
  try {
    // First try to fetch a public table that should exist
    try {
      const { error } = await supabase.from('health_check').select('count').limit(1);
      if (!error) return true;
    } catch (e) {
  
    }
    
    // If that fails, try a simple auth ping which should always work
    const { error } = await supabase.auth.getSession();
    return !error;
  } catch (error) {
    return false;
  }
};

export const fetchOutingDetailsByOTP = async (otp) => {
  try {
    const otpCols = ['id','otp','otp_used','otp_verified_by','otp_verified_at','status','out_date','in_date','in_time','name','hostel_name'].join(',');
    const { data: allData, error: allError } = await supabase
      .from('outing_requests')
      .select(otpCols)
      .eq('otp', otp)
      .single();
    
    if (allError && allError.code !== 'PGRST116') throw allError;
    if (!allData) return null;
    if (allData.otp_used === true) return null;
    if (allData.status !== 'still_out') return null;
    
    return {
      id: allData.id,
      otp: allData.otp,
      otp_used: allData.otp_used,
      otp_verified_by: allData.otp_verified_by,
      otp_verified_at: allData.otp_verified_at,
      status: allData.status,
      out_date: allData.out_date,
      in_date: allData.in_date,
      in_time: allData.in_time,
      name: allData.name,
      hostel_name: allData.hostel_name
    };
  } catch (error) {
    throw handleError(error);
  }
};

export const markOTPAsUsed = async (otp) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const archGateEmail = user?.email || 'unknown';
    
    const { data, error } = await supabase
      .from('outing_requests')
      .update({ 
        otp_used: true,
        otp_verified_by: archGateEmail,
        otp_verified_at: new Date().toISOString()
      })
      .eq('otp', otp)
      .select('id, otp, otp_used, otp_verified_by, otp_verified_at, status');

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No rows were updated');
    
    return data[0];
  } catch (error) {
    throw new Error(`Failed to mark OTP as used: ${error.message}`);
  }
};

/**
 * Ban a student
 * @param {Object} banData - The ban data (student_email, from_date, till_date, reason, banned_by)
 * @returns {Promise<Object>} - Ban confirmation
 */
export const banStudent = async (banData) => {
  try {
    // Validate required fields
    if (!banData.student_email || !banData.from_date || !banData.till_date || !banData.banned_by) {
      throw new Error('Missing required fields: student_email, from_date, till_date, and banned_by are required.');
    }

  // Application-level security: Check if user is authorized to ban
  // Prefer centralized warden context (sessionStorage fallback kept for older clients)
  const { wardenLoggedIn: ctxWardenLoggedIn } = getWardenContext();

  // Get current user from Supabase auth
  const { data: { user } } = await supabase.auth.getUser();
    let adminRole = '';
    let isWarden = false;
    
    if (user && user.email) {
      try {
        const adminInfo = await fetchAdminInfoByEmail(user.email);
        adminRole = adminInfo?.role || '';
      } catch (err) {
        // Continue if admin info fetch fails
      }
    }
    
    // Check if user is a warden (like super admin check)
    if (ctxWardenLoggedIn) {
      isWarden = true;
    } else if (user && user.email) {
      try {
        const wardenInfo = await fetchWardenInfoByEmail(user.email);
        isWarden = !!wardenInfo;
      } catch (err) {
        // Continue if warden info fetch fails
      }
    }

    // Only allow superadmin or warden to ban
    if (!isWarden && adminRole !== 'superadmin') {
      throw new Error('Unauthorized: Only super admins and wardens can ban students.');
    }

    // Check if student is already banned for overlapping dates
    const { data: existingBans, error: checkError } = await supabase
      .from('ban_students')
      .select('id,student_email,from_date,till_date,reason,banned_by,is_active')
      .eq('student_email', banData.student_email)
      .eq('is_active', true)
      .or(`from_date.lte.${banData.till_date},till_date.gte.${banData.from_date}`);

    if (checkError) throw checkError;

    if (existingBans && existingBans.length > 0) {
      throw new Error('Student is already banned for overlapping dates.');
    }

    // Insert the ban record, always set is_active: true
    const { data, error } = await supabase
      .from('ban_students')
      .insert([{
        student_email: banData.student_email,
        from_date: banData.from_date,
        till_date: banData.till_date,
        reason: banData.reason || null,
        banned_by: banData.banned_by,
        is_active: true
      }])
      .select();

    if (error) throw error;

    return {
      success: true,
      message: 'Student banned successfully!',
      ban: data[0]
    };
  } catch (error) {
    throw handleError(error);
  }
};



/**
 * Fetch all bans (admin only)
 * @returns {Promise<Array>} - Array of all bans
 */
export const fetchAllBans = async () => {
  try {
    const { data, error } = await supabase
      .from('ban_students')
      .select('id,student_email,from_date,till_date,reason,banned_by,is_active,created_at,updated_at')
      .eq('is_active', true);
    if (error) throw error;
    return data;
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Delete a ban (soft delete by setting is_active to false)
 * @param {string} banId - The ban ID to delete
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteBan = async (banId) => {
  try {
    const { data, error } = await supabase
      .from('ban_students')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', banId)
      .select();

    if (error) throw error;

    return {
      success: true,
      message: 'Ban removed successfully!',
      ban: data[0]
    };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Check if a student is currently banned
 * @param {string} studentEmail - The student's email
 * @returns {Promise<Object|null>} - Active ban if exists, null otherwise
 */
export const checkStudentBanStatus = async (studentEmail) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { data, error } = await supabase
      .from('ban_students')
      .select('id,student_email,from_date,till_date,reason,banned_by,is_active')
      .eq('student_email', studentEmail.toLowerCase())
      .eq('is_active', true)
      .lte('from_date', today)
      .gte('till_date', today)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    
    return data || null;
  } catch (error) {
    throw handleError(error);
  }
};

export const checkAndAutoUnban = async (studentEmail) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: bans, error } = await supabase
      .from('ban_students')
      .select('id,student_email,from_date,till_date,reason,banned_by,is_active')
      .eq('student_email', studentEmail.toLowerCase())
      .eq('is_active', true);
    if (error) throw error;
    let activeBan = null;
    for (const ban of bans) {
      if (ban.till_date && ban.till_date < today) {
        // Auto-unban
        await supabase
          .from('ban_students')
          .update({ is_active: false })
          .eq('id', ban.id);
      } else if (ban.till_date && ban.from_date && ban.from_date <= today && today <= ban.till_date) {
        activeBan = ban;
      }
    }
    return activeBan;
  } catch (error) {
    throw handleError(error);
  }
};
