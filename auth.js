/**
 * Authentication Module
 * Handles user authentication and session management using Supabase
 */

const AuthManager = {
    SESSION_KEY: 'vidyapith_session',

    /**
     * Authenticate a user
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @param {string} role - User role (judge, superjudge, admin)
     * @returns {Promise<{success: boolean, user?: object, error?: string}>}
     */
    async login(username, password, role) {
        try {
            if (role === 'judge') {
                const judge = await SupabaseService.getJudgeByUsername(username);
                if (judge) {
                    const isValid = await PasswordUtils.verifyPassword(password, judge.password_hash);
                    if (isValid) {
                        this.setSession({
                            userId: judge.id,
                            username: judge.username,
                            name: judge.name,
                            role: 'judge'
                        });
                        return { success: true, user: judge };
                    }
                }
            } else if (role === 'superjudge') {
                const superJudge = await SupabaseService.getSuperJudgeByUsername(username);
                if (superJudge) {
                    const isValid = await PasswordUtils.verifyPassword(password, superJudge.password_hash);
                    if (isValid) {
                        this.setSession({
                            userId: superJudge.id,
                            username: superJudge.username,
                            name: superJudge.name,
                            role: 'superjudge'
                        });
                        return { success: true, user: superJudge };
                    }
                }
            } else if (role === 'admin') {
                const admin = await SupabaseService.getAdminByUsername(username);
                if (admin) {
                    const isValid = await PasswordUtils.verifyPassword(password, admin.password_hash);
                    if (isValid) {
                        this.setSession({
                            userId: admin.id,
                            username: admin.username,
                            name: 'Administrator',
                            role: 'admin'
                        });
                        return { success: true, user: { id: admin.id, name: 'Administrator', role: 'admin' } };
                    }
                } else {
                    // Fallback: check for default admin credentials (for initial setup)
                    if (username === 'admin' && password === 'admin') {
                        this.setSession({
                            userId: 'admin',
                            username: 'admin',
                            name: 'Administrator',
                            role: 'admin'
                        });
                        return { success: true, user: { id: 'admin', name: 'Administrator', role: 'admin' } };
                    }
                }
            }

            return { success: false, error: 'Invalid username or password' };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Authentication failed. Please try again.' };
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
     * Check if user is logged in
     */
    isLoggedIn() {
        return this.getSession() !== null;
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

