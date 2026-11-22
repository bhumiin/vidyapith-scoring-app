/**
 * Authentication Module
 * Handles user authentication and session management using Supabase
 *
 * The password is never verified in the browser any more: login() sends it to
 * a Postgres function, which checks the bcrypt hash and returns a signed token.
 * Every later request carries that token, and Postgres decides what the caller
 * may read or write.
 */

const AuthManager = {
    SESSION_KEY: (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.sessionKey) || 'vidyapith_session',

    /**
     * Authenticate a user
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @param {string} role - User role (judge, superjudge, admin)
     * @returns {Promise<{success: boolean, user?: object, error?: string}>}
     */
    async login(username, password, role) {
        try {
            const result = await SupabaseService.login(username, password, role);

            if (!result || !result.ok) {
                return {
                    success: false,
                    error: (result && result.error) || 'Invalid username or password'
                };
            }

            this.setSession({
                token: result.token,
                expiresAt: result.expires_at,
                userId: result.user.id,
                username: result.user.username,
                name: result.user.name,
                role: result.user.role
            });

            return { success: true, user: result.user };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: error.message || 'Cannot reach the database. Please try again.'
            };
        }
    },

    /**
     * Set session data
     */
    setSession(sessionData) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
    },

    /**
     * Get current session
     */
    getSession() {
        const data = localStorage.getItem(this.SESSION_KEY);
        return data ? JSON.parse(data) : null;
    },

    /**
     * Check if user is logged in (and the token has not expired)
     */
    isLoggedIn() {
        const session = this.getSession();
        if (!session || !session.token) return false;
        if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
            this.logout();
            return false;
        }
        return true;
    },

    /**
     * Get current user
     * @returns {Promise<object|null>}
     */
    async getCurrentUser() {
        const session = this.getSession();
        if (!session) return null;

        try {
            if (session.role === 'judge') {
                // Postgres returns only this judge's own row
                const judges = await SupabaseService.getJudges();
                return judges.find(j => j.id === session.userId) || null;
            } else if (session.role === 'superjudge') {
                const superJudges = await SupabaseService.getSuperJudges();
                return superJudges.find(sj => sj.id === session.userId) || null;
            } else if (session.role === 'admin') {
                return { id: session.userId || 'admin', name: 'Administrator', role: 'admin' };
            }
        } catch (error) {
            console.error('Error fetching current user:', error);
            return null;
        }

        return null;
    },

    /**
     * Get current user role
     */
    getCurrentRole() {
        const session = this.getSession();
        return session ? session.role : null;
    },

    /**
     * Logout
     */
    logout() {
        localStorage.removeItem(this.SESSION_KEY);
    }
};
