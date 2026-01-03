/**
 * Password Utilities
 * Handles password hashing and verification
 * Uses bcrypt.js library (lightweight bcrypt implementation for browsers)
 */

const PasswordUtils = {
    /**
     * Hash a password using bcrypt
     * @param {string} password - Plain text password
     * @returns {Promise<string>} - Hashed password
     */
    async hashPassword(password) {
        // Check if bcrypt library is available
        if (typeof dcodeIO === 'undefined' || !dcodeIO.bcrypt) {
            console.error('bcrypt library not loaded. Please include bcrypt.js script.');
            // Fallback: simple hash (NOT SECURE - only for development)
            return this.simpleHash(password);
        }
        
        try {
            const salt = await dcodeIO.bcrypt.genSalt(10);
            const hash = await dcodeIO.bcrypt.hash(password, salt);
            return hash;
        } catch (error) {
            console.error('Error hashing password:', error);
            throw error;
        }
    },

    /**
     * Verify a password against a hash
     * @param {string} password - Plain text password
     * @param {string} hash - Hashed password
     * @returns {Promise<boolean>} - True if password matches
     */
    async verifyPassword(password, hash) {
        // Check if bcrypt library is available
        if (typeof dcodeIO === 'undefined' || !dcodeIO.bcrypt) {
            console.error('bcrypt library not loaded. Using fallback verification.');
            // Fallback: simple hash comparison (NOT SECURE - only for development)
            return this.simpleHash(password) === hash;
        }
        
        try {
            return await dcodeIO.bcrypt.compare(password, hash);
        } catch (error) {
            console.error('Error verifying password:', error);
            return false;
        }
    },

    /**
     * Simple hash function (fallback - NOT SECURE for production)
     * Only use this if bcrypt is not available
     */
    simpleHash(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }
};


