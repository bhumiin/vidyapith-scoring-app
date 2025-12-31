# Supabase Integration Setup Guide

This guide will help you set up Supabase as the backend for the Vidyapith Scoring App.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- Basic knowledge of SQL

## Step 1: Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in your project details:
   - Name: `vidyapith-scoring-app` (or your preferred name)
   - Database Password: Choose a strong password (save it securely)
   - Region: Choose the region closest to your users
4. Click "Create new project"
5. Wait for the project to be set up (this may take a few minutes)

## Step 2: Set Up the Database Schema

1. In your Supabase project dashboard, go to the SQL Editor
2. Open the `database-setup.sql` file from this project
3. Copy the entire contents of the file
4. Paste it into the SQL Editor in Supabase
5. Click "Run" to execute the SQL script
6. Verify that all tables were created successfully by checking the "Table Editor" section

## Step 3: Configure Your Supabase Credentials

1. In your Supabase project dashboard, go to Settings > API
2. Copy your:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys" > "anon public")
3. Open `supabase-config.js` in this project
4. Replace the placeholder values:
   ```javascript
   const SUPABASE_CONFIG = {
       url: 'YOUR_SUPABASE_PROJECT_URL',  // Replace with your Project URL
       anonKey: 'YOUR_SUPABASE_ANON_KEY'   // Replace with your anon key
   };
   ```

## Step 4: Set Up Admin User Password

The default admin user is created with a placeholder password hash. You need to update it:

1. Go to https://bcrypt-generator.com/
2. Enter your desired admin password (e.g., "admin")
3. Click "Generate Hash"
4. Copy the generated hash
5. In Supabase SQL Editor, run:
   ```sql
   UPDATE admin_users 
   SET password_hash = 'YOUR_GENERATED_HASH_HERE' 
   WHERE username = 'admin';
   ```
   Replace `YOUR_GENERATED_HASH_HERE` with the hash you copied.

## Step 5: Test the Connection

1. Open `index.html` in a web browser
2. Open the browser's Developer Console (F12)
3. Check for any errors related to Supabase connection
4. Try logging in with:
   - Username: `admin`
   - Password: (the password you set in Step 4)
   - Role: `Admin`

## Step 6: Row Level Security (RLS) Configuration

The current setup allows all operations for simplicity. For production use, you should:

1. Review and customize the RLS policies in `database-setup.sql`
2. Consider implementing role-based access control
3. Restrict access based on user roles (admin, judge, superjudge)

## Troubleshooting

### Connection Errors

- **Error: "Supabase configuration missing"**
  - Make sure you've updated `supabase-config.js` with your credentials
  - Check that the URL and anon key are correct

- **Error: "Failed to initialize Supabase client"**
  - Verify that the Supabase script is loaded in `index.html`
  - Check your browser console for network errors
  - Ensure your Supabase project is active

### Authentication Errors

- **"Invalid username or password"**
  - Verify the admin password hash was updated correctly
  - Check that the bcrypt library is loaded (check browser console)
  - Try regenerating the password hash

### Database Errors

- **"relation does not exist"**
  - Make sure you ran the `database-setup.sql` script completely
  - Check that all tables were created in the Table Editor

- **"permission denied"**
  - Verify RLS policies are set correctly
  - Check that the anon key has the necessary permissions

## Security Notes

1. **Never commit your Supabase credentials to version control**
   - Add `supabase-config.js` to `.gitignore` if it contains real credentials
   - Consider using environment variables for production

2. **Password Security**
   - Use strong passwords for admin accounts
   - Consider implementing password reset functionality
   - Regularly rotate passwords

3. **API Keys**
   - The anon key is safe to use in client-side code
   - Never expose your service role key in client-side code
   - Use the service role key only in server-side code or Edge Functions

## Next Steps

1. Create judges and super judges through the admin interface
2. Set up groups and assign students
3. Configure scoring criteria
4. Test the complete workflow

## Support

For issues or questions:
- Check the Supabase documentation: https://supabase.com/docs
- Review the browser console for error messages
- Check the Supabase project logs in the dashboard

