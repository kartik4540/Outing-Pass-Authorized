import { supabase } from '../supabaseClient';
import { getStatusUpdateEmail, getStillOutAlertEmail, getNowOutEmail, getReturnedEmail } from './mailTemplates';

// No longer need API_BASE_URL as we're using Supabase directly

/**
 * Helper function to handle errors
 * @param {Error} error - The error object
 * @returns {Error} - Formatted error
 */
const handleError = (error) => {
  console.error('API error:', error);
  return new Error(error.message || 'An error occurred with the Supabase request');
};

/**
 * Fetch available seats for a given date and lab
 * @param {string} date - The date to fetch available seats for
 * @param {string} lab - The lab to fetch available seats for
 * @returns {Promise<Object>} - Available seats data
 */
export const fetchAvailableSeats = async (date, lab) => {
  try {
    // Query available_seats view or function in Supabase
    const { data: existingBookings, error } = await supabase
      .from('outing_requests')
      .select('*')
      .eq('date', date)
      .eq('lab', lab)
      .in('status', ['confirmed', 'waiting']); // Check both confirmed and waiting bookings
    
    if (error) throw error;
    
    // Transform data to match the expected format
    const bookedSlots = existingBookings ? existingBookings.map(booking => booking.time_slot) : [];
    
    // Get all time slots
    const allTimeSlots = [
      "08:00-08:50", "08:50-09:40", "09:45-10:35", 
      "10:40-11:30", "11:35-12:25", "12:30-01:20", 
      "01:25-02:15", "02:20-03:10", "03:10-04:00", 
      "04:00-04:50"
    ];
    
    // Calculate available slots
    const availableSlots = allTimeSlots.map(slot => {
      const isBooked = bookedSlots.includes(slot);
      return {
        time_slot: slot,
        available: !isBooked,
        status: isBooked ? 'booked' : 'available'
      };
    });
    
    return { 
      availableSlots
    };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Book a lab slot
 * @param {Object} bookingData - The booking data
 * @returns {Promise<Object>} - Booking confirmation
 */
export const bookSlot = async (bookingData) => {
  try {
    // Validate required fields
    if (!bookingData.name || !bookingData.email || !bookingData.hostelName || !bookingData.outDate || !bookingData.outTime || !bookingData.inDate || !bookingData.inTime) {
      throw new Error('Missing required fields: name, email, hostel, out date/time, in date/time are required.');
    }

    // Insert the outing request into the database
    const { data, error } = await supabase
      .from('outing_requests')
      .insert([
        {
          name: bookingData.name,
          email: bookingData.email,
          hostel_name: bookingData.hostelName,
          out_date: bookingData.outDate,
          out_time: bookingData.outTime,
          in_date: bookingData.inDate,
          in_time: bookingData.inTime,
          parent_email: bookingData.parentEmail,
          parent_phone: bookingData.parentPhone, // NEW: include parent_phone
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
export const fetchBookedSlots = async (email) => {
  try {
    const { data, error } = await supabase
      .from('outing_requests')
      .select('*')
      .eq('email', email);
    
    if (error) throw error;
    
    // Calculate counts for each status
    const waiting = data.filter(booking => booking.status === 'waiting').length;
    const confirmed = data.filter(booking => booking.status === 'confirmed').length;
    const rejected = data.filter(booking => booking.status === 'rejected').length;
    
    data.counts = { waiting, confirmed, rejected };
    
    return data;
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
 * Fetch all bookings (admin only)
 * @param {string} adminEmail - The admin's email
 * @returns {Promise<Array>} - Array of all bookings
 */
export const fetchPendingBookings = async (adminEmail) => {
  try {
    // Fetch all outing requests for admin
    const { data, error } = await supabase
      .from('outing_requests')
      .select('*')
      .order('out_date', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error fetching outing requests:', error);
      throw new Error(`Failed to fetch outing requests: ${error.message}`);
    }
    
    if (!data) {
      console.error('No data returned from outing requests query');
      throw new Error('No outing request data available');
    }
    
    return data;
  } catch (error) {
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
export const handleBookingAction = async (bookingId, action, adminEmail) => {
  try {
    // action is now the new status: 'still_out', 'confirmed', 'rejected'
    const newStatus = action;
    let otp = null;
    if (newStatus === 'confirmed') {
      // Only generate OTP if confirming and not already set
      const { data: existing, error: fetchErr } = await supabase
        .from('outing_requests')
        .select('otp')
        .eq('id', bookingId)
        .single();
      if (fetchErr) throw fetchErr;
      if (!existing.otp) {
        let unique = false;
        while (!unique) {
          otp = generateOTP();
          const { data: otpExists } = await supabase
            .from('outing_requests')
            .select('id')
            .eq('otp', otp);
          if (!otpExists || otpExists.length === 0) unique = true;
        }
      } else {
        otp = existing.otp;
      }
    }
    const updateObj = {
      status: newStatus,
      handled_by: adminEmail,
      handled_at: new Date().toISOString(),
    };
    if (otp) updateObj.otp = otp;
    const { data, error } = await supabase
      .from('outing_requests')
      .update(updateObj)
      .eq('id', bookingId)
      .select();
    if (error) {
      console.error('Supabase update error:', error);
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
    console.error('handleBookingAction error:', error);
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

/**
 * Add or update student info (upsert by student_email)
 * @param {Object} info - student info object
 * @returns {Promise<Object>} - inserted/updated row
 */
export async function addOrUpdateStudentInfo(info) {
    const { data, error } = await supabase
      .from('student_info')
    .upsert([info], { onConflict: ['student_email'] });
    if (error) throw error;
  return data;
  }

/**
 * Fetch all student info (admin only)
 * @returns {Promise<Array>} - Array of student info
 */
export const fetchAllStudentInfo = async () => {
  try {
    const { data, error } = await supabase
      .from('student_info')
      .select('*')
      .order('student_email', { ascending: true });
    if (error) throw error;
    return data;
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Fetch student info by email
 * @param {string} email - Student email
 * @returns {Promise<Object>} - Student info
 */
export const fetchStudentInfoByEmail = async (email) => {
  try {
    const { data, error } = await supabase
      .from('student_info')
      .select('*')
      .eq('student_email', email.toLowerCase())
      .single();
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
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
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
 * Authenticate warden by username and password
 * @param {string} username
 * @param {string} password
 * @returns {Promise<Object|null>} - Warden info or null if not found/invalid
 */
export const authenticateWarden = async (username, password) => {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('username', username)
      // .eq('role', 'warden') // Temporarily removed for debugging
      .maybeSingle();
    console.log('Supabase warden query:', { data, error, username, password }); // Debug log
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    if (data.password !== password) return null;
    return data;
  } catch (error) {
    return null;
  }
};

/**
 * Authenticate system user by username and password
 * @param {string} username - The user's username
 * @param {string} password - The user's password
 * @returns {Promise<Object|null>} - User info or null if not found/invalid
 */
export const authenticateSystemUser = async (username, password) => {
  try {
    const { data, error } = await supabase
      .from('system_users')
      .select('*')
      .eq('username', username)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    if (data.password_hash !== password) return null;
    return data;
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
      console.log('Health check table not found, trying alternate method');
    }
    
    // If that fails, try a simple auth ping which should always work
    const { error } = await supabase.auth.getSession();
    return !error;
  } catch (error) {
    console.error('Supabase connection error:', error);
    return false;
  }
};

export const fetchOutingDetailsByOTP = async (otp) => {
  try {
    const { data, error } = await supabase
      .from('outing_requests')
      .select('*')
      .eq('otp', otp)
      .eq('otp_used', false)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw handleError(error);
  }
};

export const markOTPAsUsed = async (otp) => {
  try {
    const { error } = await supabase
      .from('outing_requests')
      .update({ otp_used: true })
      .eq('otp', otp);
    if (error) throw error;
    return true;
  } catch (error) {
    throw handleError(error);
  }
};