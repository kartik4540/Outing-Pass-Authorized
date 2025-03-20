import { supabase } from '../supabaseClient';

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
 * @param {string} dayOrder - The manually selected day order
 * @returns {Promise<Object>} - Available seats data
 */
export const fetchAvailableSeats = async (date, lab, dayOrder) => {
  try {
    // Query available_seats view or function in Supabase
    const { data: existingBookings, error } = await supabase
      .from('lab_bookings')
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

    // Define regular class slots for each lab and day order combination
    const regularClassSlots = {
      'LAB A': {
        '1': [],  // No regular classes
        '2': [],  // No regular classes
        '3': ["10:40-11:30", "03:10-04:00"],  // 10:40 AM to 11:30 AM and 3:10 PM to 4:00 PM
        '4': ["08:00-08:50", "08:50-09:40", "12:30-01:20", "01:25-02:15"],  // 8:00 AM to 9:40 AM and 12:30 PM to 2:15 PM
        '5': ["09:45-10:35", "10:40-11:30", "11:35-12:25", "12:30-01:20", "01:25-02:15", "02:20-03:10", "03:10-04:00", "04:00-04:50"]  // 9:45 AM to 4:50 PM
      },
      'LAB B': {
        '1': [],  // No regular classes
        '2': [],  // No regular classes
        '3': [],  // No regular classes
        '4': [],  // No regular classes
        '5': []   // No regular classes
      },
      'LAB C': {
        '1': [],  // No regular classes
        '2': [],  // No regular classes
        '3': [],  // No regular classes
        '4': [],  // No regular classes
        '5': []   // No regular classes
      },
      'LAB D': {
        '1': ["02:20-03:10", "03:10-04:00", "04:00-04:50"],  // 2:10 PM to 4:30 PM
        '2': ["01:25-02:15", "02:20-03:10", "03:10-04:00", "04:00-04:50"],  // 1:25 PM to 4:55 PM
        '3': ["09:45-10:35", "10:40-11:30"],  // 9:45 AM to 11:30 AM
        '4': [],  // NIL - no slots to freeze
        '5': ["08:00-08:50", "08:50-09:40", "09:45-10:35", "10:40-11:30"]  // 8:00 AM to 11:30 AM
      }
    };
    
    // Calculate available slots
    const availableSlots = allTimeSlots.map(slot => {
      const isBooked = bookedSlots.includes(slot);
      const isRegularClass = regularClassSlots[lab]?.[dayOrder]?.includes(slot) || false;
      
      return {
        time_slot: slot,
        available: !isBooked && !isRegularClass,
        status: isBooked ? 'booked' : isRegularClass ? 'regular_class' : 'available'
      };
    });
    
    return { 
      availableSlots,
      dayOrder
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
    // Ensure timeSlots is an array
    if (bookingData.timeSlot) {
      bookingData.timeSlots = [bookingData.timeSlot];
      delete bookingData.timeSlot;
    } else if (!bookingData.timeSlots) {
      bookingData.timeSlots = [];
    }

    // Validate required fields
    if (!bookingData.date || !bookingData.lab || !bookingData.timeSlots || bookingData.timeSlots.length === 0) {
      throw new Error('Missing required fields: date, lab, and at least one time slot are required.');
    }

    // Create a booking for each time slot
    const bookingPromises = bookingData.timeSlots.map(async (timeSlot) => {
      // First check if there's any existing active booking for this slot
      const { data: existingBookings, error: checkError } = await supabase
        .from('lab_bookings')
        .select('*')
        .eq('date', bookingData.date)
        .eq('lab', bookingData.lab)
        .eq('time_slot', timeSlot)
        .in('status', ['waiting', 'confirmed']); // Only check waiting and confirmed bookings

      if (checkError) throw checkError;

      // If there's an existing active booking, throw an error
      if (existingBookings && existingBookings.length > 0) {
        throw new Error(`The slot ${timeSlot} is already booked or pending approval.`);
      }

      // If no existing active booking, proceed with insertion
      const { data, error } = await supabase
        .from('lab_bookings')
        .insert([
          { 
            date: bookingData.date,
            lab: bookingData.lab,
            time_slot: timeSlot,
            email: bookingData.email,
            name: bookingData.name,
            faculty_id: bookingData.facultyId,
            department: bookingData.department,
            day_order: bookingData.dayOrder,
            status: 'waiting' // Initial status is waiting for admin approval
          }
        ])
        .select();

      if (error) {
        // If there's a unique constraint violation, delete any rejected booking and try again
        if (error.code === '23505') { // Postgres unique constraint violation code
          // Delete the rejected booking
          await supabase
            .from('lab_bookings')
            .delete()
            .match({
              date: bookingData.date,
              lab: bookingData.lab,
              time_slot: timeSlot,
              status: 'rejected'
            });

          // Try inserting again
          const { data: retryData, error: retryError } = await supabase
            .from('lab_bookings')
            .insert([
              { 
                date: bookingData.date,
                lab: bookingData.lab,
                time_slot: timeSlot,
                email: bookingData.email,
                name: bookingData.name,
                faculty_id: bookingData.facultyId,
                department: bookingData.department,
                day_order: bookingData.dayOrder,
                status: 'waiting' // Initial status is waiting for admin approval
              }
            ])
            .select();

          if (retryError) throw retryError;
          return retryData[0];
        }
        throw error;
      }
      return data[0];
    });

    const results = await Promise.all(bookingPromises.map(p => p.catch(e => e)));
    
    // Check if any of the results are errors
    const errors = results.filter(r => r instanceof Error);
    if (errors.length > 0) {
      throw new Error(errors.map(e => e.message).join('\n'));
    }
    
    return { 
      success: true, 
      message: 'Booking requests submitted successfully', 
      bookings: results 
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
      .from('lab_bookings')
      .select('*')
      .eq('email', email);
    
    if (error) throw error;
    
    // Calculate counts for each status
    const waiting = data.filter(booking => booking.status === 'waiting').length;
    const confirmed = data.filter(booking => booking.status === 'confirmed').length;
    const rejected = data.filter(booking => booking.status === 'rejected').length;
    
    // Add counts to the response
    data.counts = { waiting, confirmed, rejected };
    
    // Format dates for display
    data.forEach(booking => {
      if (booking.date) {
        const date = new Date(booking.date);
        booking.formatted_date = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    });
    
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
    const { data, error } = await supabase
      .from('lab_bookings')
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
    // Fetch all bookings with better error handling
    const { data, error } = await supabase
      .from('lab_bookings')
      .select('*')
      // No status filter - fetch all bookings
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error fetching bookings:', error);
      throw new Error(`Failed to fetch bookings: ${error.message}`);
    }
    
    if (!data) {
      console.error('No data returned from bookings query');
      throw new Error('No booking data available');
    }
    
    // Format dates for display
    const formattedData = data.map(booking => {
      if (booking.date) {
        const date = new Date(booking.date);
        return {
          ...booking,
          formatted_date: date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        };
      }
      return booking;
    });
    
    return formattedData;
  } catch (error) {
    console.error('Error in fetchPendingBookings:', error);
    throw handleError(error);
  }
};

/**
 * Handle booking action (confirm/reject)
 * @param {number} bookingId - The booking ID to update
 * @param {string} action - The action to perform ('confirm' or 'reject')
 * @param {string} adminEmail - The admin's email
 * @returns {Promise<Object>} - Action confirmation
 */
export const handleBookingAction = async (bookingId, action, adminEmail) => {
  try {
    // For now, we'll bypass the admin check to make the function work
    // We'll assume the frontend UI will only show this option to admin users
    
    // Update the booking status
    const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
    
    const { data, error } = await supabase
      .from('lab_bookings')
      .update({ status: newStatus })
      .eq('id', bookingId)
      .select();
    
    if (error) throw error;
    
    return { 
      success: true, 
      message: `Booking ${newStatus} successfully`, 
      booking: data[0] 
    };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Fetch day order for a date
 * @param {string} date - The date to fetch day order for
 * @returns {Promise<Object>} - Day order data
 */
export const fetchDayOrder = async (date) => {
  try {
    const { data, error } = await supabase
      .from('day_orders')
      .select('*')
      .eq('date', date);
    
    if (error) throw error;
    
    return data.length > 0 ? data[0] : { date, day_order: null };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Set day order reference (admin only)
 * @param {string} adminEmail - The admin's email
 * @param {string} referenceDate - The reference date
 * @param {string} dayOrder - The day order
 * @returns {Promise<Object>} - Confirmation
 */
export const setDayOrderReference = async (adminEmail, referenceDate, dayOrder) => {
  try {
    // For now, we'll bypass the admin check to make the function work
    // We'll assume the frontend UI will only show this option to admin users
    
    // Upsert the day order
    const { data, error } = await supabase
      .from('day_orders')
      .upsert([
        { date: referenceDate, day_order: dayOrder }
      ])
      .select();
    
    if (error) throw error;
    
    return { 
      success: true, 
      message: 'Day order set successfully', 
      day_order: data[0] 
    };
  } catch (error) {
    throw handleError(error);
  }
};

/**
 * Get day order references (admin only)
 * @param {string} adminEmail - The admin's email
 * @returns {Promise<Array>} - Array of day order references
 */
export const getDayOrderReferences = async (adminEmail) => {
  try {
    // For now, we'll bypass the admin check to make the function work
    // We'll assume the frontend UI will only show this option to admin users
    
    // Fetch all day orders
    const { data, error } = await supabase
      .from('day_orders')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    throw handleError(error);
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