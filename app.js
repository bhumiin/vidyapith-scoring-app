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

        if (!username || !password) {
            this.showLoginError('Please enter your username and password');
            return;
        }

        try {
            // The role is not chosen here: Postgres resolves it from the
            // credential and the session carries whatever it returns.
            const result = await AuthManager.login(username, password);
            if (result.success) {
                this.showLoginError('');
                // Force page reload to clear all cached state and reinitialize views.
                // Queued writes live in localStorage, so this reload is safe and
                // must not trip the unsaved-changes prompt.
                window.__vpAllowUnload = true;
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
        // The view name on <body> lets the restyle convert one screen at a time
        document.body.dataset.view = viewName;

        // the judge panes are sized from whatever sits above them
        if (viewName === 'judge' && window.JudgeView && JudgeView.updatePaneHeight) {
            requestAnimationFrame(() => JudgeView.updatePaneHeight());
        }

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
    window.addEventListener('resize', () => {
        if (document.body.dataset.view === 'judge' && window.JudgeView && JudgeView.updatePaneHeight) {
            JudgeView.updatePaneHeight();
        }
    });

    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

