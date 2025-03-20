# Installation Guide

This guide will help you set up the SRM MAC LAB Slot Booking System using Supabase as the backend.

## 1. Prerequisites

- Node.js (v14+)
- npm or yarn
- A Supabase account (sign up at https://supabase.com if you don't have one)

## 2. Supabase Setup

### Create a New Supabase Project

1. Log in to your Supabase account
2. Create a new project
3. Take note of your Supabase URL and anon key (you'll need these later)

### Set Up the Database Schema

1. In your Supabase dashboard, go to the SQL Editor
2. Copy the contents of `setup/supabase-init.sql` and paste it into the SQL Editor
3. Run the script to create all necessary tables and security policies
4. Uncomment and modify the admin user creation line to add yourself as an admin user

### Set Up Authentication

1. In your Supabase dashboard, go to Authentication → Providers
2. Enable Google OAuth provider
3. Follow the instructions to set up Google OAuth (you'll need to create a Google Cloud project)
4. Set up the callback URL to match your deployment URL or development URL (e.g., http://localhost:3000)
5. Optional: Under Authentication → URL Configuration, set your site URL and redirect URLs

## 3. Application Setup

### Clone the Repository

```bash
git clone <repository-url>
cd <repository-directory>
```

### Install Dependencies

```bash
npm install
# or if you use yarn
yarn install
```

### Environment Configuration

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` and add your Supabase project URL and anon key:
```
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
```

## 4. Running the Application

### Development Mode

```bash
npm start
# or if you use yarn
yarn start
```

This will start the application in development mode at http://localhost:3000.

### Building for Production

```bash
npm run build
# or if you use yarn
yarn build
```

This will create a production build in the `build` directory.

## 5. Deployment

### Vercel (Recommended)

1. Install Vercel CLI: `npm install -g vercel`
2. Run `vercel` in the project directory
3. Follow the prompts to deploy
4. Set up environment variables in the Vercel dashboard

### Netlify

1. Install Netlify CLI: `npm install -g netlify-cli`
2. Run `netlify deploy` in the project directory
3. Follow the prompts to deploy
4. Set up environment variables in the Netlify dashboard

## 6. Troubleshooting

### Authentication Issues

- Make sure your Supabase project has the correct redirect URLs configured
- Check that your OAuth provider settings are correct
- Verify that you've set the correct environment variables

### Database Issues

- Check that all tables were created correctly
- Verify that Row Level Security (RLS) policies are properly configured
- Make sure you've added at least one admin user to the admins table

### API Issues

- Check your browser console for error messages
- Verify that your Supabase URL and anon key are correct in your environment variables
- Make sure your RLS policies allow the operations you're attempting to perform 