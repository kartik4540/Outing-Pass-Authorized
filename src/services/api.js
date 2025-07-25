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
 * Book a lab slot
 * @param {Object} bookingData - The booking data
 * @returns {Promise<Object>} - Booking confirmation
 */
export const bookSlot = async (bookingData) => {
  try {
    // Validate required fields
    if (!bookingData.name || !bookingData.email || !bookingData.hostelName || !bookingData.outDate || !bookingData.outTime || !bookingData.inDate || !bookingData.inTime || !bookingData.reason) {
      throw new Error('Missing required fields: name, email, hostel, out date/time, in date/time, reason are required.');
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
export const handleBookingAction = async (bookingId, action, adminEmail, rejectionReason) => {
  try {
    // action is now the new status: 'still_out', 'confirmed', 'rejected'
    let newStatus = action;
    if (action === 'reject') newStatus = 'rejected';
    let otp = null;
    let resetOtpUsed = false;
    if (newStatus === 'still_out' || newStatus === 'confirmed') {
      // Generate a new OTP if moving to still_out or confirmed and OTP is missing or used
      const { data: existing, error: fetchErr } = await supabase
        .from('outing_requests')
        .select('otp, otp_used')
        .eq('id', bookingId)
        .single();
      if (fetchErr) throw fetchErr;
      if (!existing.otp || existing.otp_used) {
        let unique = false;
        while (!unique) {
          otp = generateOTP();
          const { data: otpExists } = await supabase
            .from('outing_requests')
            .select('id')
            .eq('otp', otp);
          if (!otpExists || otpExists.length === 0) unique = true;
        }
        resetOtpUsed = true;
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
    if (resetOtpUsed) updateObj.otp_used = false;
    if (newStatus === 'confirmed') {
      // If moving from still_out to confirmed, mark OTP as used
      updateObj.otp_used = true;
    }
    if (newStatus === 'rejected') {
      updateObj.rejection_reason = rejectionReason || null;
    }
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
  // Convert all string fields to lowercase
  const lowerInfo = Object.fromEntries(
    Object.entries(info).map(([k, v]) => [k, typeof v === 'string' ? v.toLowerCase() : v])
  );
  const { data, error } = await supabase
    .from('student_info')
    .upsert([lowerInfo], { onConflict: ['student_email'] });
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
      .order('student_email', { ascending: true })
      .range(0, 9999); // fetch up to 10,000 rows
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
    const { data, error } = await supabase
      .from('outing_requests')
      .update({ otp_used: true })
      .eq('otp', otp)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error) {
    throw handleError(error);
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

    // Check if student is already banned for overlapping dates
    const { data: existingBans, error: checkError } = await supabase
      .from('ban_students')
      .select('*')
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

// Helper: Set is_active=true for all existing bans (run once if needed)
export const migrateSetAllBansActive = async () => {
  try {
    const { error } = await supabase
      .from('ban_students')
      .update({ is_active: true })
      .is('is_active', null);
    if (error) throw error;
    return { success: true };
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
      .select('*')
      .eq('is_active', true);
    if (error) throw error;
    return data;
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Fetch active bans for a student
 * @param {string} studentEmail - The student's email
 * @returns {Promise<Array>} - Array of active bans for the student
 */
export const fetchStudentBans = async (studentEmail) => {
  try {
    const { data, error } = await supabase
      .from('ban_students')
      .select('*')
      .eq('student_email', studentEmail.toLowerCase()) // ensure case-insensitive match
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Update a ban
 * @param {string} banId - The ban ID to update
 * @param {Object} updateData - The data to update
 * @returns {Promise<Object>} - Update confirmation
 */
export const updateBan = async (banId, updateData) => {
  try {
    const { data, error } = await supabase
      .from('ban_students')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', banId)
      .select();

    if (error) throw error;

    return {
      success: true,
      message: 'Ban updated successfully!',
      ban: data[0]
    };
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
      .select('*')
      .eq('student_email', studentEmail)
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
      .select('*')
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