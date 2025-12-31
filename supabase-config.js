/**
 * Supabase Configuration
 * Replace these values with your Supabase project credentials
 * 
 * To get your credentials:
 * 1. Go to your Supabase project dashboard
 * 2. Navigate to Settings > API
 * 3. Copy your Project URL and anon/public key
 */

const SUPABASE_CONFIG = {
    // Your Supabase project URL
    url: 'https://uueilgnjodakvxamwvbe.supabase.co',
    
    // Your Supabase anon/public key (safe to expose in client-side code)
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZWlsZ25qb2Rha3Z4YW13dmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMjI5NzAsImV4cCI6MjA4MjY5ODk3MH0.BDmk7qbgCoZbUGnx0ckNPSmfE0wBAW7cwK3vrmRU92o'
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SUPABASE_CONFIG;
}

