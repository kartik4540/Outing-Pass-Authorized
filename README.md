# Outing Pass Management System (Supabase Edition)

A modern outing pass management system for hostels, built with React and Supabase. Supports student outing requests, admin/warden approval, parent notifications, and secure authentication.

---

## Features

- **Student Outing Requests:**  Students can request outings, specifying dates, times, and parent contact info.
- **Admin & Warden Dashboard:**  Admins and wardens can view, approve, reject, or mark students as “still out.”
- **Parent Notifications:**  Automated email notifications to parents for status updates (using Mailgun).
- **Secure Authentication:**  All logins (admin, warden, arch_gate) are managed via the `system_users` table in Supabase.
- **Student Info Management:**  Admins can manage student info, including parent contact details.
- **Day Order Management:**  Admins can set and view day orders.
- **Mobile-Friendly UI:**  Responsive design for all devices.

---

## Technology Stack

- **Frontend:** React.js
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions)
- **Email:** Mailgun (via Supabase Edge Function)
- **Authentication:** Supabase Auth & custom user table

---

## Database Schema

### 1. `admins`
Stores admin and warden info.

### 2. `student_info`
Stores student and parent contact info.

### 3. `outing_requests`
Tracks all outing requests and their statuses.

### 4. `system_users`
Handles all custom logins (warden, arch_gate, etc.).

### 5. `day_orders`
Manages day order references.

### 6. `health_check`
For API health checks.

**See `setup/supabase-init.sql` for full schema and RLS policies.**

---

## Environment Variables

Set these in your `.env` (local) and in Vercel dashboard (production):

```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_DOMAIN=your_mailgun_domain
```

---

## Mailgun API Key Management

- Update via Supabase CLI or Dashboard (see README above for details).
- Never commit secrets to git.

---

## Deployment

1. Push your code to [kartik4540/Outing-Pass-Authorized](https://github.com/kartik4540/Outing-Pass-Authorized)
2. Import the repo in [Vercel](https://vercel.com/)
3. Set environment variables in Vercel
4. Deploy and update Supabase Auth redirect URLs

---

## Security

- All sensitive actions are protected by Supabase Row Level Security (RLS).
- No hardcoded credentials; all logins are database-driven.

---

## Getting Started

1. Clone the repo and install dependencies:
   ```sh
   git clone https://github.com/kartik4540/Outing-Pass-Authorized.git
   cd Outing-Pass-Authorized
   npm install
   ```
2. Set up your `.env` file.
3. Run the app:
   ```sh
   npm start
   ```

---
