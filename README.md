# Outing Pass Management System

A production-ready outing pass management system for SRM hostels. Built with React and Supabase, featuring role-based access control, real-time updates, and automated parent notifications.

---

## Features

### Student Features

- Request outings with dates, times, and parent contact information
- View booking history with real-time status tracking
- Generate OTPs for confirmed outings
- Date and time validation to prevent invalid entries

### Admin and Warden Features

- Role-based access control (Super Admin, Warden, Arch Gate)
- Manage pending bookings (approve, reject, mark as "still out")
- Extend a Still Out student's expected return date/time, up to twice per booking, with a reason and audit trail
- View and manage student information
- Hostel-based filtering (wardens see only their assigned hostels)
- Track students who have not returned (with late indicators)
- Ban or unban students from requesting outings
- Handler tracking for all booking actions
- Bulk student information upload via Excel

### Arch Gate Features

- OTP verification at the hostel entrance
- One-time use OTPs that expire after verification
- Real-time confirmation when a student enters

### Security Features

- Supabase Authentication with Google OAuth for students (restricted to `@srmist.edu.in` accounts)
- Custom username and password authentication for admin, warden, and arch gate roles
- Row Level Security (RLS) enforced at the database level
- Server-side filtering and validation
- Secure session management

### Notification System

- Automated parent email notifications via Brevo
- Professional email templates
- Real-time status updates

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js (Hooks, Context API) |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| Authentication | Supabase Auth + Custom Password Auth |
| Email Service | Brevo API |
| Security | Row Level Security (RLS) Policies |
| Deployment | Vercel |

---

## User Roles and Permissions

| Role | Can View | Can Edit | Can Approve/Reject |
|------|----------|----------|---------------------|
| Student | Own bookings | Own waiting requests | No |
| Warden | Assigned hostel bookings | All bookings in hostel | Yes |
| Super Admin | All bookings | All bookings | Yes |
| Arch Gate | Still Out (OTP verification) | Mark OTP as used | No |

---

## Booking Status Flow

```
Waiting -> (Warden Approves) -> Still Out -> (Student Generates OTP) -> (Arch Gate Verifies) -> Confirmed
   |
   +-> (Warden Rejects) -> Rejected
```

### Status Meanings

- **Waiting**: Student submitted the request; pending warden approval.
- **Still Out**: Approved by warden; student is currently out.
- **Confirmed**: Student returned and the arch gate verified the OTP.
- **Rejected**: Warden rejected the request.

---

## Key Features Explained

### Still Out Tab

- Shows students currently out of the hostel.
- Loads the last one month of records by default for performance.
- A late indicator appears if a student missed the expected return time.
- Room number search works across all dates.

### OTP System

- The OTP is generated only on the outing date.
- Each OTP is single-use and expires after arch gate verification.
- The system tracks who verified the OTP and when.

### Extension System

- Wardens/admins can extend a Still Out student's expected return date/time, up to two times per booking.
- Each extension requires a reason, and records who made the change and when.
- The original expected return date/time is preserved for reference after the first extension.

### Ban System

- Wardens can ban students for specific date ranges.
- The ban is automatically lifted after the specified end date.
- Banned students cannot create new requests during the ban period.

### Email Notifications

Parents are notified when:
- A student is marked "Still Out" (approved).
- A student returns and is marked "Confirmed".
- A request is rejected.

---

## Project Structure

```
├── src/
│   ├── components/         # Reusable components (Navbar, Modal, Toast)
│   ├── pages/               # Main pages (Login, SlotBooking, PendingBookings, etc.)
│   ├── services/            # API calls and email templates
│   ├── utils/                # Helper functions (role detection, session storage)
│   ├── assets/               # Images and static files
│   └── App.js                # Main app component with routing
├── supabase/
│   ├── CREATE_TABLES.sql     # Table definitions
│   ├── COMPLETE_SCHEMA.sql   # Helper functions, RLS policies, indexes
│   ├── functions/            # Edge functions (send-email)
│   └── config.toml           # Supabase configuration
├── public/                   # Public assets
└── build/                    # Production build output
```

---

## API Reference

### Main API Functions (`src/services/api.js`)

**Student Operations**
- `bookSlot(bookingData)` — create a new outing request
- `fetchBookedSlots(email)` — get a student's booking history
- `generateOtpForBooking(bookingId)` — generate an OTP for a booking

**Admin/Warden Operations**
- `fetchBookingsFiltered(options)` — get filtered bookings with pagination
- `handleBookingAction(bookingId, action, email, reason)` — approve or reject bookings
- `extendOutingTime(bookingId, newInDate, newInTime, extensionReason, extendedBy)` — extend a Still Out student's return time
- `banStudent(banData)` — ban a student from requesting outings

**Arch Gate Operations**
- `fetchOutingDetailsByOTP(otp)` — validate an OTP
- `markOTPAsUsed(otp)` — mark an OTP as verified

---

## Performance Optimizations

- Database indexes on frequently queried columns
- Pagination for large datasets
- Lazy loading and code splitting
- Optimized RLS policies with minimal joins
- Client-side caching with `useMemo` and `useCallback`
- Still Out tab limited to recent records (one month)

---

## Troubleshooting

### Issue: OTP not generating
- **Cause**: Timezone mismatch or incorrect date.
- **Fix**: The system uses the local date. Ensure the system date is correct.

### Issue: Warden sees no bookings
- **Cause**: Warden is not assigned to any hostels.
- **Fix**: A super admin must assign hostels to the warden in the database.

### Issue: Still Out tab times out
- **Cause**: Too many historical records being queried.
- **Fix**: Apply the indexes defined in `COMPLETE_SCHEMA.sql`.

---

## License

This project is proprietary software. All rights reserved.

---

## Acknowledgments

- SRM Institute of Science and Technology, for the platform
- Supabase, for backend infrastructure
- Vercel, for the deployment platform
- Brevo, for email services

---

## Project Credits

**Made by:** Kartik Mittal (km5260@srmist.edu.in)

**Co-developer:** Reetam Kole (rk0598@srmist.edu.in)

**Maintained by:** Viva Baranwal (vb1680@srmist.edu.in), Yatin Annam (ya8476@srmist.edu.in), Krishanth R J (kr3976@srmist.edu.in)
