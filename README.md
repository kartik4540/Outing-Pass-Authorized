# SRM MAC LAB Slot Booking System - Supabase Edition

A simplified version of the slot booking system that uses Supabase directly without a separate backend.

## Features

- User authentication with Google (limited to @srmist.edu.in email addresses)
- Lab slot booking system for multiple labs
- Admin approval workflow for bookings
- Day order management
- Responsive UI for mobile and desktop

## Technology Stack

- **Frontend**: React.js
- **Backend**: Supabase (Backend as a Service)
- **Database**: PostgreSQL (hosted on Supabase)
- **Authentication**: Supabase Auth with Google OAuth

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn
- A Supabase account and project

### Installation

1. Clone the repository
2. Navigate to the project directory
3. Install dependencies:
```
npm install
```

### Configuration

1. Create a `.env` file in the root directory with your Supabase credentials:
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup

Create the following tables in your Supabase project:

#### 1. lab_bookings
```sql
CREATE TABLE lab_bookings (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  lab TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  register_number TEXT NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  admin_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (date, lab, time_slot)
);

-- Add indexes for faster queries
CREATE INDEX lab_bookings_date_idx ON lab_bookings(date);
CREATE INDEX lab_bookings_email_idx ON lab_bookings(email);
CREATE INDEX lab_bookings_status_idx ON lab_bookings(status);
```

#### 2. admins
```sql
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3. day_orders
```sql
CREATE TABLE day_orders (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  day_order TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 4. health_check (for API health checks)
```sql
CREATE TABLE health_check (
  id SERIAL PRIMARY KEY,
  status TEXT DEFAULT 'ok',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO health_check (status) VALUES ('ok');
```

### Running the Application

```
npm start
```

The application will be available at http://localhost:3000.

### Building for Production

```
npm run build
```

## Deployment

You can deploy the frontend to Vercel, Netlify, or any other static site hosting:

1. Connect your repository to the deployment platform
2. Set the environment variables for Supabase URL and key
3. Deploy the application

## Authentication Setup

1. In your Supabase project, enable Google OAuth
2. Configure the redirect URLs for your application
3. Restrict sign-in to @srmist.edu.in email addresses in the application code

## Security Considerations

This direct-to-Supabase approach uses Row Level Security (RLS) to secure your data. Ensure you have these policies set up:

1. For `lab_bookings` table:
   - Users can only view their own bookings
   - Admins can view and update all bookings
   - Users can create new bookings

2. For `admins` table:
   - Only admins can view the admins table
   - Only super-admins can modify the admins table

3. For `day_orders` table:
   - Anyone can view day orders
   - Only admins can create or modify day orders

## Benefits of This Approach

1. **Simplified Architecture**: No need to maintain a separate backend
2. **Reduced Deployment Complexity**: Only one service to deploy
3. **Built-in Authentication**: Leveraging Supabase Auth
4. **Real-time Capabilities**: Using Supabase's real-time subscriptions
5. **Scalable**: Automatically scales with your application needs 