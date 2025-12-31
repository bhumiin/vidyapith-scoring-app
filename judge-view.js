/**
 * Judge View Module
 * Handles the judge scoring interface
 */

const JudgeView = {
    currentStudentId: null,
    currentScores: {},

    async init() {
        this.setupEventListeners();
        await this.render();
    },

    setupEventListeners() {
        // Student selection
        document.getElementById('judge-student-select').addEventListener('change', (e) => {
            this.selectStudent(e.target.value).catch(error => {
                console.error('Error selecting student:', error);
            });
        });

        // Student search
        document.getElementById('judge-student-search').addEventListener('input', (e) => {
            this.filterStudents(e.target.value).catch(error => {
                console.error('Error filtering students:', error);
            });
        });

        // Submit scores
        document.getElementById('submit-scores').addEventListener('click', () => {
            this.submitScores().catch(error => {
                console.error('Error submitting scores:', error);
            });
        });

        // Save draft
        document.getElementById('save-scores').addEventListener('click', () => {
            this.saveDraft().catch(error => {
                console.error('Error saving draft:', error);
            });
        });

        // Logout
        document.getElementById('judge-logout').addEventListener('click', () => {
            AuthManager.logout();
            App.showView('login');
        });
    },

    async render() {
        const user = await AuthManager.getCurrentUser();
        if (!user) return;

        try {
            // Display judge's groups
            const groups = await DataManager.getGroups();
            const judgeGroupIds = await SupabaseService.getJudgeGroups(user.id);
            const judgeGroups = groups.filter(g => judgeGroupIds.includes(g.id));
            const groupNames = judgeGroups.map(g => g.name).join(', ') || 'No grades assigned';
            document.getElementById('judge-groups-info').textContent = `Grades: ${groupNames}`;

            // Get students for this judge
            const students = await GroupManager.getStudentsForJudge(user.id);
            this.renderStudentSelect(students);
            await this.renderScoredStudents();
        } catch (error) {
            console.error('Error rendering judge view:', error);
            alert('Error loading judge view. Please refresh the page.');
        }
    },

    async renderStudentSelect(students) {
        const select = document.getElementById('judge-student-select');
        const searchTerm = document.getElementById('judge-student-search').value.toLowerCase();
        
        const filtered = students.filter(s => 
            s.name.toLowerCase().includes(searchTerm)
        );

        const user = await AuthManager.getCurrentUser();
        if (!user) return;

        const options = await Promise.all(filtered.map(async student => {
            const submitted = await DataManager.isSubmitted(student.id, user.id);
            const status = submitted ? ' (Submitted)' : '';
            return `<option value="${student.id}">${student.name}${status}</option>`;
        }));

        select.innerHTML = '<option value="">-- Select a student --</option>' + options.join('');
    },

    async filterStudents(searchTerm) {
        const user = await AuthManager.getCurrentUser();
        const students = await GroupManager.getStudentsForJudge(user.id);
        await this.renderStudentSelect(students);
    },

    async selectStudent(studentId) {
        if (!studentId) {
            document.getElementById('judge-scoring-section').style.display = 'none';
            this.currentStudentId = null;
            return;
        }

        try {
            this.currentStudentId = studentId;
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === studentId);
            const criteria = await DataManager.getCriteria();
            const user = await AuthManager.getCurrentUser();
            const submitted = await DataManager.isSubmitted(studentId, user.id);

            document.getElementById('current-student-name').textContent = student.name;
            document.getElementById('judge-scoring-section').style.display = 'block';

            // Load existing scores
            this.currentScores = {};
            for (const criterion of criteria) {
                const score = await DataManager.getScore(studentId, user.id, criterion.id);
                this.currentScores[criterion.id] = score || '';
            }

            // Render criteria inputs
            const container = document.getElementById('criteria-scores');
            container.innerHTML = criteria.map(criterion => {
                const score = this.currentScores[criterion.id] || '';
                const disabled = submitted ? 'disabled' : '';
                return `
                <div class="criterion-score-item">
                    <label>${criterion.name} (1-10):</label>
                    <input 
                        type="number" 
                        min="1" 
                        max="10" 
                        value="${score}" 
                        data-criterion-id="${criterion.id}"
                        ${disabled}
                        class="score-input"
                        onchange="JudgeView.updateScore('${criterion.id}', this.value)"
                    >
                </div>
            `;
            }).join('');

            // Update submit button state
            const submitBtn = document.getElementById('submit-scores');
            if (submitted) {
                submitBtn.textContent = 'Scores Submitted (Locked)';
                submitBtn.disabled = true;
                submitBtn.classList.add('btn-disabled');
            } else {
                submitBtn.textContent = 'Submit Scores';
                submitBtn.disabled = false;
                submitBtn.classList.remove('btn-disabled');
            }

            this.calculateTotal();
        } catch (error) {
            console.error('Error selecting student:', error);
            alert('Error loading student. Please try again.');
        }
    },

    updateScore(criterionId, value) {
        if (!this.currentStudentId) return;

        const score = parseInt(value);
        if (isNaN(score) || score < 1 || score > 10) {
            if (value !== '') {
                alert('Score must be between 1 and 10');
                return;
            }
        }

        this.currentScores[criterionId] = value ? score : null;
        this.calculateTotal();
    },

    calculateTotal() {
        const total = Object.values(this.currentScores).reduce((sum, score) => {
            return sum + (score || 0);
        }, 0);
        document.getElementById('judge-total-score').textContent = total;
    },

    async saveDraft() {
        if (!this.currentStudentId) {
            alert('Please select a student first');
            return;
        }

        try {
            const user = await AuthManager.getCurrentUser();
            const criteria = await DataManager.getCriteria();

            for (const criterion of criteria) {
                const score = this.currentScores[criterion.id];
                if (score !== null && score !== undefined && score !== '') {
                    await DataManager.setScore(this.currentStudentId, user.id, criterion.id, score);
                }
            }

            alert('Draft saved successfully!');
            await this.renderScoredStudents();
        } catch (error) {
            console.error('Error saving draft:', error);
            alert('Error saving draft. Please try again.');
        }
    },

    async submitScores() {
        if (!this.currentStudentId) {
            alert('Please select a student first');
            return;
        }

        try {
            const user = await AuthManager.getCurrentUser();
            const criteria = await DataManager.getCriteria();

            // Validate all criteria are scored
            const missingScores = criteria.filter(c => {
                const score = this.currentScores[c.id];
                return !score || score === '';
            });

            if (missingScores.length > 0) {
                if (!confirm(`Some criteria are not scored. Submit anyway?`)) {
                    return;
                }
            }

            // Save all scores
            for (const criterion of criteria) {
                const score = this.currentScores[criterion.id];
                if (score !== null && score !== undefined && score !== '') {
                    await DataManager.setScore(this.currentStudentId, user.id, criterion.id, score);
                }
            }

            // Mark as submitted
            await DataManager.submitScores(this.currentStudentId, user.id);

            alert('Scores submitted successfully!');
            await this.selectStudent(this.currentStudentId); // Refresh to show locked state
            await this.renderScoredStudents();
        } catch (error) {
            console.error('Error submitting scores:', error);
            alert('Error submitting scores. Please try again.');
        }
    },

    async renderScoredStudents() {
        try {
            const user = await AuthManager.getCurrentUser();
            const students = await GroupManager.getStudentsForJudge(user.id);
            const criteria = await DataManager.getCriteria();
            const container = document.getElementById('scored-students-list');

            const scoredStudents = [];
            for (const student of students) {
                let hasScore = false;
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    if (score !== null) {
                        hasScore = true;
                        break;
                    }
                }
                if (hasScore) {
                    scoredStudents.push(student);
                }
            }

            if (scoredStudents.length === 0) {
                container.innerHTML = '<p class="empty-message">No students scored yet.</p>';
                return;
            }

            const cards = await Promise.all(scoredStudents.map(async student => {
                const submitted = await DataManager.isSubmitted(student.id, user.id);
                let total = 0;
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    if (score !== null) {
                        total += score;
                    }
                }

                return `
                    <div class="scored-student-card ${submitted ? 'submitted' : 'draft'}">
                        <div class="scored-student-info">
                            <strong>${student.name}</strong>
                            <span class="badge ${submitted ? 'badge-success' : 'badge-warning'}">
                                ${submitted ? 'Submitted' : 'Draft'}
                            </span>
                        </div>
                        <div class="scored-student-total">
                            Total: <strong>${total}</strong>
                        </div>
                    </div>
                `;
            }));

            container.innerHTML = cards.join('');
        } catch (error) {
            console.error('Error rendering scored students:', error);
            const container = document.getElementById('scored-students-list');
            container.innerHTML = '<p class="empty-message">Error loading scored students.</p>';
        }
    }
};

