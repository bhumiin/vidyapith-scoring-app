/**
 * Main Application Controller
 * Handles view routing and initialization
 */

const App = {
    init() {
        this.setupLoginForm();
        this.checkAuth();
    },

    setupLoginForm() {
        const form = document.getElementById('login-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
    },

    async handleLogin() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const role = document.getElementById('role').value;

        if (!username || !password || !role) {
            this.showLoginError('Please fill in all fields');
            return;
        }

        try {
            const result = await AuthManager.login(username, password, role);
            if (result.success) {
                this.showLoginError('');
                // Force page reload to clear all cached state and reinitialize views
                window.location.reload(true);
            } else {
                this.showLoginError(result.error || 'Invalid credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showLoginError('An error occurred during login. Please try again.');
        }
    },

    showLoginError(message) {
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = message;
        errorDiv.style.display = message ? 'block' : 'none';
    },

    async checkAuth() {
        if (AuthManager.isLoggedIn()) {
            await this.routeToView();
        } else {
            this.showView('login');
        }
    },

    async routeToView() {
        const role = AuthManager.getCurrentRole();
        if (role === 'admin') {
            this.showView('setup');
        } else if (role === 'judge') {
            this.showView('judge');
        } else if (role === 'superjudge') {
            this.showView('superjudge');
        } else {
            this.showView('login');
        }
    },

    showView(viewName) {
        // Hide all views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        // Show selected view
        const viewElement = document.getElementById(`${viewName}-view`);
        if (viewElement) {
            viewElement.classList.add('active');
        }

        // Initialize view if needed
        if (viewName === 'setup') {
            SetupView.init().catch(error => {
                console.error('Error initializing setup view:', error);
            });
        } else if (viewName === 'judge') {
            JudgeView.init().catch(error => {
                console.error('Error initializing judge view:', error);
            });
        } else if (viewName === 'superjudge') {
            SuperJudgeView.init().catch(error => {
                console.error('Error initializing superjudge view:', error);
            });
        }
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

