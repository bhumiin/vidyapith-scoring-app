/**
 * Judge View Module
 * Handles the judge scoring interface
 */

const JudgeView = {
    currentStudentId: null,
    currentScores: {},
    selectedGradeId: null,
    _listenersInitialized: false,
    // Stopwatch state
    stopwatch: {
        elapsedSeconds: 0,
        timerInterval: null,
        isRunning: false,
        isPaused: false,
        timeLimitSeconds: null
    },

    async init() {
        this.setupEventListeners();
        await this.render();
    },

    setupEventListeners() {
        if (this._listenersInitialized) {
            return;
        }
        // Student selection
        document.getElementById('judge-student-select').addEventListener('change', (e) => {
            this.selectStudent(e.target.value).catch(error => {
                console.error('Error selecting student:', error);
            });
        });

        // Grade capsule clicks (delegated event handling)
        const groupsInfoElement = document.getElementById('judge-groups-info');
        if (groupsInfoElement) {
            groupsInfoElement.addEventListener('click', (e) => {
                const gradeCapsule = e.target.closest('.grade-capsule.clickable');
                if (gradeCapsule) {
                    const groupId = gradeCapsule.dataset.groupId;
                    this.selectGrade(groupId).catch(error => {
                        console.error('Error selecting grade:', error);
                    });
                }
            });
        }

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

        // Stopwatch controls
        document.getElementById('stopwatch-start-stop').addEventListener('click', () => {
            this.startStopStopwatch();
        });

        document.getElementById('stopwatch-pause').addEventListener('click', () => {
            this.pauseStopwatch();
        });

        document.getElementById('stopwatch-reset').addEventListener('click', () => {
            this.resetStopwatch();
        });

        this._listenersInitialized = true;
    },

    async render() {
        const user = await AuthManager.getCurrentUser();
        if (!user) return;

        try {
            // Display judge name
            const session = AuthManager.getSession();
            if (session && session.name) {
                document.getElementById('judge-name-display').textContent = session.name;
            }

            // Display judge's groups with topics
            const groups = await DataManager.getGroups();
            const judgeGroupIds = await SupabaseService.getJudgeGroups(user.id);
            const judgeGroups = groups.filter(g => judgeGroupIds.includes(g.id));
            const groupsInfoElement = document.getElementById('judge-groups-info');
            const topicsContainerElement = document.getElementById('judge-topics-info');
            
            // Reset selected grade
            this.selectedGradeId = null;
            
            if (judgeGroups.length === 0) {
                groupsInfoElement.innerHTML = '<span class="grade-capsule">No grades assigned</span>';
                if (topicsContainerElement) {
                    topicsContainerElement.innerHTML = '';
                }
            } else {
                const isMultipleGrades = judgeGroups.length > 1;
                const clickableClass = isMultipleGrades ? 'clickable' : '';
                
                // Fetch and display topics for each grade
                if (judgeGroups.length === 1) {
                    // Single grade: auto-select and show topics directly
                    this.selectedGradeId = judgeGroups[0].id;
                    const selectedClass = 'selected';
                    
                    // Render grade capsule with selected class
                    groupsInfoElement.innerHTML = judgeGroups.map(g => 
                        `<span class="grade-capsule ${selectedClass}" data-group-id="${g.id}">Grade ${g.name}</span>`
                    ).join('');
                    
                    const topics = await DataManager.getTopicsByGroup(judgeGroups[0].id);
                    await this.renderTopics(topics, judgeGroups[0].id);
                } else {
                    // Multiple grades: render clickable capsules
                    groupsInfoElement.innerHTML = judgeGroups.map(g => 
                        `<span class="grade-capsule ${clickableClass}" data-group-id="${g.id}">Grade ${g.name}</span>`
                    ).join('');
                    
                    // Show message to select a grade
                    if (topicsContainerElement) {
                        topicsContainerElement.innerHTML = '<p class="topic-message">Please select a grade to view topics and students</p>';
                    }
                }
            }

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
        
        // Filter students by selected grade if one is selected
        let filtered = students;
        if (this.selectedGradeId) {
            filtered = students.filter(s => s.group_id === this.selectedGradeId);
        }

        const user = await AuthManager.getCurrentUser();
        if (!user) return;

        if (filtered.length === 0) {
            if (this.selectedGradeId) {
                select.innerHTML = '<option value="">No students assigned to this grade</option>';
            } else {
                select.innerHTML = '<option value="">-- Select a grade first --</option>';
            }
            return;
        }

        const options = await Promise.all(filtered.map(async student => {
            const submitted = await DataManager.isSubmitted(student.id, user.id);
            const status = submitted ? ' (Submitted)' : '';
            return `<option value="${student.id}">${student.name}${status}</option>`;
        }));

        select.innerHTML = '<option value="">-- Select a student --</option>' + options.join('');
    },

    async selectGrade(groupId) {
        this.selectedGradeId = groupId;
        
        // Update visual state of grade capsules
        const groupsInfoElement = document.getElementById('judge-groups-info');
        if (groupsInfoElement) {
            const capsules = groupsInfoElement.querySelectorAll('.grade-capsule');
            capsules.forEach(capsule => {
                if (capsule.dataset.groupId === groupId) {
                    capsule.classList.add('selected');
                } else {
                    capsule.classList.remove('selected');
                }
            });
        }
        
        // Fetch and display topics for selected grade
        const topics = await DataManager.getTopicsByGroup(groupId);
        await this.renderTopics(topics, groupId);
        
        // Filter and re-render student dropdown
        const user = await AuthManager.getCurrentUser();
        if (!user) return;
        
        const students = await GroupManager.getStudentsForJudge(user.id);
        await this.renderStudentSelect(students);
        
        // Clear current student selection if it's not in the selected grade
        if (this.currentStudentId) {
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === this.currentStudentId);
            if (student && student.group_id !== groupId) {
                document.getElementById('judge-student-select').value = '';
                this.selectStudent('').catch(error => {
                    console.error('Error clearing student selection:', error);
                });
            }
        }
        
        // Refresh scored students list to show only students from selected grade
        await this.renderScoredStudents();
    },

    async renderTopics(topics, groupId) {
        const topicsContainerElement = document.getElementById('judge-topics-info');
        if (!topicsContainerElement) return;
        
        if (topics.length === 0) {
            topicsContainerElement.innerHTML = '<p class="topic-message">No topics assigned to this grade</p>';
            return;
        }
        
        // Display topics as a centered list
        const topicsList = topics.map(topic => {
            const timeLimit = topic.time_limit ? ` (${topic.time_limit} min)` : '';
            return `<li>${topic.name}${timeLimit}</li>`;
        }).join('');
        
        topicsContainerElement.innerHTML = `
            <div class="topics-display">
                <h3 class="topics-title">Topics:</h3>
                <ul class="topics-list">${topicsList}</ul>
            </div>
        `;
    },

    async selectStudent(studentId) {
        if (!studentId) {
            document.getElementById('judge-scoring-section').style.display = 'none';
            document.getElementById('stopwatch-container').style.display = 'none';
            this.currentStudentId = null;
            this.resetStopwatch();
            return;
        }

        try {
            this.currentStudentId = studentId;
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === studentId);
            const criteria = await DataManager.getCriteria();
            const user = await AuthManager.getCurrentUser();
            const submitted = await DataManager.isSubmitted(studentId, user.id);

            // Initialize stopwatch with topic time limit
            await this.initializeStopwatch(student.group_id);

            document.getElementById('current-student-name').textContent = student.name;
            document.getElementById('judge-scoring-section').style.display = 'block';
            document.getElementById('stopwatch-container').style.display = 'block';

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
            const container = document.getElementById('scored-students-list');
            
            // Check if judge has multiple grades and no grade is selected
            const groups = await DataManager.getGroups();
            const judgeGroupIds = await SupabaseService.getJudgeGroups(user.id);
            const judgeGroups = groups.filter(g => judgeGroupIds.includes(g.id));
            
            if (judgeGroups.length > 1 && !this.selectedGradeId) {
                container.innerHTML = '<p class="empty-message">Please select a grade to view scored students.</p>';
                return;
            }
            
            let students = await GroupManager.getStudentsForJudge(user.id);
            
            // Filter students by selected grade if one is selected
            if (this.selectedGradeId) {
                students = students.filter(s => s.group_id === this.selectedGradeId);
            }
            
            const criteria = await DataManager.getCriteria();

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
    },

    /**
     * Initialize stopwatch with topic time limit for the selected grade
     */
    async initializeStopwatch(groupId) {
        try {
            // Reset stopwatch first
            this.resetStopwatch();

            // Get topics for the grade
            const topics = await DataManager.getTopicsByGroup(groupId);
            
            // Get time limit from first topic (one topic per grade)
            if (topics && topics.length > 0 && topics[0].time_limit) {
                // Convert minutes to seconds
                this.stopwatch.timeLimitSeconds = topics[0].time_limit * 60;
            } else {
                this.stopwatch.timeLimitSeconds = null;
            }

            // Update display immediately
            this.updateStopwatchDisplay();
        } catch (error) {
            console.error('Error initializing stopwatch:', error);
            this.stopwatch.timeLimitSeconds = null;
            this.updateStopwatchDisplay();
        }
    },

    /**
     * Start or stop the stopwatch
     */
    startStopStopwatch() {
        if (this.stopwatch.isRunning) {
            this.stopStopwatch();
        } else if (this.stopwatch.isPaused) {
            // Resume from pause
            this.startStopwatch();
        } else {
            // Start fresh
            this.startStopwatch();
        }
    },

    /**
     * Start the stopwatch
     */
    startStopwatch() {
        if (this.stopwatch.isRunning) return;

        this.stopwatch.isRunning = true;
        this.stopwatch.isPaused = false;

        const startBtn = document.getElementById('stopwatch-start-stop');
        startBtn.textContent = 'Stop';
        startBtn.classList.remove('btn-primary');
        startBtn.classList.add('btn-danger');

        this.stopwatch.timerInterval = setInterval(() => {
            this.stopwatch.elapsedSeconds++;
            this.updateStopwatchDisplay();
            this.checkTimeLimit();
        }, 1000);
    },

    /**
     * Pause the stopwatch
     */
    pauseStopwatch() {
        if (!this.stopwatch.isRunning) return;

        this.stopwatch.isRunning = false;
        this.stopwatch.isPaused = true;

        const startBtn = document.getElementById('stopwatch-start-stop');
        startBtn.textContent = 'Resume';
        startBtn.classList.remove('btn-danger');
        startBtn.classList.add('btn-primary');

        if (this.stopwatch.timerInterval) {
            clearInterval(this.stopwatch.timerInterval);
            this.stopwatch.timerInterval = null;
        }
    },

    /**
     * Stop the stopwatch
     */
    stopStopwatch() {
        this.stopwatch.isRunning = false;
        this.stopwatch.isPaused = false;

        const startBtn = document.getElementById('stopwatch-start-stop');
        startBtn.textContent = 'Start';
        startBtn.classList.remove('btn-danger');
        startBtn.classList.add('btn-primary');

        if (this.stopwatch.timerInterval) {
            clearInterval(this.stopwatch.timerInterval);
            this.stopwatch.timerInterval = null;
        }
    },

    /**
     * Reset the stopwatch to 00:00
     */
    resetStopwatch() {
        this.stopStopwatch();
        this.stopwatch.elapsedSeconds = 0;
        this.stopwatch.isPaused = false;
        this.updateStopwatchDisplay();
        this.removeTimeLimitWarning();
        
        // Reset button text
        const startBtn = document.getElementById('stopwatch-start-stop');
        if (startBtn) {
            startBtn.textContent = 'Start';
            startBtn.classList.remove('btn-danger');
            startBtn.classList.add('btn-primary');
        }
    },

    /**
     * Update the stopwatch display
     */
    updateStopwatchDisplay() {
        const minutes = Math.floor(this.stopwatch.elapsedSeconds / 60);
        const seconds = this.stopwatch.elapsedSeconds % 60;
        const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        const timeDisplay = document.getElementById('stopwatch-time');
        if (timeDisplay) {
            timeDisplay.textContent = timeString;
        }
    },

    /**
     * Check if elapsed time exceeds the time limit and apply warning styles
     */
    checkTimeLimit() {
        if (this.stopwatch.timeLimitSeconds === null) return;

        if (this.stopwatch.elapsedSeconds > this.stopwatch.timeLimitSeconds) {
            this.applyTimeLimitWarning();
        } else {
            this.removeTimeLimitWarning();
        }
    },

    /**
     * Apply red color and blinking animation when time limit is exceeded
     */
    applyTimeLimitWarning() {
        const timeDisplay = document.getElementById('stopwatch-time');
        if (timeDisplay) {
            timeDisplay.classList.add('stopwatch-over-limit');
        }
    },

    /**
     * Remove warning styles when time is within limit
     */
    removeTimeLimitWarning() {
        const timeDisplay = document.getElementById('stopwatch-time');
        if (timeDisplay) {
            timeDisplay.classList.remove('stopwatch-over-limit');
        }
    }
};

