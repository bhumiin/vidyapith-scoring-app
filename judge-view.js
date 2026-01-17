/**
 * Judge View Module
 * Handles the judge scoring interface
 */

const JudgeView = {
    currentStudentId: null,
    currentScores: {},
    currentNotes: '',
    selectedGradeId: null,
    _listenersInitialized: false,

    async init() {
        this.setupEventListeners();
        await this.render();
    },

    setupEventListeners() {
        if (this._listenersInitialized) {
            return;
        }
        // Student selection
        const studentSelect = document.getElementById('judge-student-select');
        studentSelect.addEventListener('change', (e) => {
            this.selectStudent(e.target.value).catch(error => {
                console.error('Error selecting student:', error);
            });
        });

        // Refresh dropdown when clicked to show current status
        studentSelect.addEventListener('mousedown', async () => {
            try {
                const user = await AuthManager.getCurrentUser();
                if (!user) return;
                const students = await GroupManager.getStudentsForJudge(user.id);
                await this.renderStudentSelect(students);
            } catch (error) {
                console.error('Error refreshing student dropdown:', error);
            }
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

        // Add score
        const saveBtn = document.getElementById('save-scores');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.addScore().catch(error => {
                    console.error('Error adding score:', error);
                });
            });
        }

        // Submit all scores
        const submitAllBtn = document.getElementById('submit-all-scores');
        if (submitAllBtn) {
            submitAllBtn.addEventListener('click', () => {
                this.submitAllScores().catch(error => {
                    console.error('Error submitting all scores:', error);
                });
            });
        }

        // Notes modal handlers
        document.getElementById('notes-modal-close').addEventListener('click', () => {
            this.hideNotesModal();
        });

        document.getElementById('notes-modal-cancel').addEventListener('click', () => {
            this.hideNotesModal();
        });

        document.getElementById('notes-modal-save').addEventListener('click', () => {
            this.saveNotesFromModal().catch(error => {
                console.error('Error saving notes:', error);
            });
        });

        // Close modal when clicking overlay
        document.getElementById('notes-modal').addEventListener('click', (e) => {
            if (e.target.id === 'notes-modal') {
                this.hideNotesModal();
            }
        });

        // Track notes textarea changes
        const notesTextarea = document.getElementById('judge-notes-input');
        if (notesTextarea) {
            notesTextarea.addEventListener('input', (e) => {
                this.currentNotes = e.target.value;
            });
        }

        // Logout
        document.getElementById('judge-logout').addEventListener('click', () => {
            AuthManager.logout();
            App.showView('login');
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
            // updateSubmitAllButtonState is called inside renderScoredStudents
            // Also call it here to ensure button state is set even if renderScoredStudents has issues
            await this.updateSubmitAllButtonState();
        } catch (error) {
            console.error('Error rendering judge view:', error);
            alert('Error loading judge view. Please refresh the page.');
            // Still update button state on error
            await this.updateSubmitAllButtonState();
        }
    },

    async renderStudentSelect(students) {
        const select = document.getElementById('judge-student-select');
        
        // Preserve currently selected value
        const currentSelectedValue = select.value;
        
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
            let status = '';
            if (submitted) {
                status = ' (Submitted)';
            } else {
                // Check if student has draft scores
                const criteria = await DataManager.getCriteria();
                let hasScore = false;
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    if (score !== null) {
                        hasScore = true;
                        break;
                    }
                }
                if (hasScore) {
                    status = ' (Draft)';
                }
            }
            return `<option value="${student.id}">${student.name}${status}</option>`;
        }));

        select.innerHTML = '<option value="">-- Select a student --</option>' + options.join('');
        
        // Restore previously selected value if it still exists
        if (currentSelectedValue && select.querySelector(`option[value="${currentSelectedValue}"]`)) {
            select.value = currentSelectedValue;
        }
    },

    async selectGrade(groupId) {
        // Set selected grade first
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
        
        // Clear current student selection if it's not in the selected grade
        if (this.currentStudentId) {
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === this.currentStudentId);
            if (student && student.group_id !== groupId) {
                document.getElementById('judge-student-select').value = '';
                await this.selectStudent('');
            }
        }
        
        // Fetch and display topics for selected grade
        const topics = await DataManager.getTopicsByGroup(groupId);
        await this.renderTopics(topics, groupId);
        
        // Filter and re-render student dropdown
        const user = await AuthManager.getCurrentUser();
        if (!user) return;
        
        const students = await GroupManager.getStudentsForJudge(user.id);
        await this.renderStudentSelect(students);
        
            // Refresh scored students list to show only students from selected grade
            // This must be called after selectedGradeId is set and student dropdown is updated
            await this.renderScoredStudents();
            // updateSubmitAllButtonState is called inside renderScoredStudents
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
            this.currentStudentId = null;
            this.currentNotes = '';
            return;
        }

        try {
            this.currentStudentId = studentId;
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === studentId);
            const criteria = await DataManager.getCriteria();
            const user = await AuthManager.getCurrentUser();

            document.getElementById('current-student-name').textContent = student.name;
            document.getElementById('judge-scoring-section').style.display = 'block';

            // Load existing scores
            this.currentScores = {};
            for (const criterion of criteria) {
                const score = await DataManager.getScore(studentId, user.id, criterion.id);
                this.currentScores[criterion.id] = score || '';
            }

            // Load existing notes
            const existingNotes = await DataManager.getNote(studentId, user.id);
            this.currentNotes = existingNotes || '';
            const notesTextarea = document.getElementById('judge-notes-input');
            if (notesTextarea) {
                notesTextarea.value = this.currentNotes;
                notesTextarea.disabled = false; // Notes can always be edited
            }

            // Get all criteria
            const allCriteria = await DataManager.getCriteria();
            
            // Define criteria groups programmatically (mapping criteria names to group headers)
            // Using flexible matching to handle name variations
            const criteriaGroupMapping = {
                'Content': {
                    criteriaNames: ['Ideas Examples', 'Ideas Example', 'Values based examples', 'Relate to topic and reflect'],
                    isPenalty: false,
                    // Keywords for flexible matching
                    keywords: ['ideas', 'values', 'relate to topic']
                },
                'Language': {
                    criteriaNames: ['Creativity Language'],
                    isPenalty: false,
                    keywords: ['creativity language', 'language']
                },
                'Presentation': {
                    criteriaNames: ['Confidence Style Effectiveness'],
                    isPenalty: false,
                    keywords: ['confidence', 'style', 'effectiveness', 'presentation']
                },
                'Preparation': {
                    criteriaNames: ['Reading Sentences', 'Overtime (contd. after 2nd bell)'],
                    isPenalty: true,
                    keywords: ['reading', 'sentences', 'overtime', 'preparation']
                }
            };
            
            // Define order for groups
            const groupOrder = ['Content', 'Language', 'Presentation', 'Preparation'];
            
            // Organize criteria into groups
            const groupedCriteria = {};
            groupOrder.forEach(groupName => {
                groupedCriteria[groupName] = {
                    header: groupName,
                    criteria: [],
                    isPenalty: criteriaGroupMapping[groupName].isPenalty
                };
            });
            
            // Add ungrouped criteria container
            groupedCriteria['Ungrouped'] = {
                header: 'Ungrouped',
                criteria: [],
                isPenalty: false
            };
            
            // Assign criteria to groups based on name matching (flexible matching)
            allCriteria.forEach(criterion => {
                let assigned = false;
                const criterionNameLower = criterion.name.toLowerCase();
                
                for (const groupName in criteriaGroupMapping) {
                    const groupMapping = criteriaGroupMapping[groupName];
                    
                    // Check exact name matches first
                    const exactMatch = groupMapping.criteriaNames.some(name => 
                        criterionNameLower === name.toLowerCase() ||
                        criterionNameLower.includes(name.toLowerCase()) || 
                        name.toLowerCase().includes(criterionNameLower)
                    );
                    
                    // Check keyword matches if exact match fails
                    const keywordMatch = groupMapping.keywords && groupMapping.keywords.some(keyword => 
                        criterionNameLower.includes(keyword.toLowerCase())
                    );
                    
                    if (exactMatch || keywordMatch) {
                        groupedCriteria[groupName].criteria.push(criterion);
                        assigned = true;
                        break;
                    }
                }
                if (!assigned) {
                    groupedCriteria['Ungrouped'].criteria.push(criterion);
                }
            });
            
            // Sort criteria within each group according to predefined order
            groupOrder.forEach(groupName => {
                if (groupedCriteria[groupName] && criteriaGroupMapping[groupName]) {
                    const order = criteriaGroupMapping[groupName].criteriaNames;
                    groupedCriteria[groupName].criteria.sort((a, b) => {
                        const aIndex = order.findIndex(name => 
                            a.name.toLowerCase().includes(name.toLowerCase()) || 
                            name.toLowerCase().includes(a.name.toLowerCase())
                        );
                        const bIndex = order.findIndex(name => 
                            b.name.toLowerCase().includes(name.toLowerCase()) || 
                            name.toLowerCase().includes(b.name.toLowerCase())
                        );
                        
                        if (aIndex !== -1 && bIndex !== -1) {
                            return aIndex - bIndex;
                        }
                        if (aIndex !== -1) return -1;
                        if (bIndex !== -1) return 1;
                        return a.name.localeCompare(b.name);
                    });
                }
            });
            
            // Define score ranges for each criterion by name
            const getScoreRange = (criterionName) => {
                const nameLower = criterionName.toLowerCase();
                
                // Content group: 1-5 for Ideas Examples and Relate to topic, 1-10 for Values based examples
                if (nameLower.includes('ideas example')) {
                    return { min: 1, max: 5 };
                }
                if (nameLower.includes('values based examples')) {
                    return { min: 1, max: 10 };
                }
                if (nameLower.includes('relate to topic')) {
                    return { min: 1, max: 5 };
                }
                
                // Language group: 1-10
                if (nameLower.includes('creativity language')) {
                    return { min: 1, max: 10 };
                }
                
                // Presentation group: 1-10
                if (nameLower.includes('confidence') || nameLower.includes('style') || nameLower.includes('effectiveness')) {
                    return { min: 1, max: 10 };
                }
                
                // Preparation group: 1-5 (penalty)
                if (nameLower.includes('reading sentences')) {
                    return { min: 1, max: 5 };
                }
                if (nameLower.includes('overtime')) {
                    return { min: 1, max: 5 };
                }
                
                // Default: use database values if available, otherwise return null to indicate missing
                return null;
            };
            
            // Helper function to render a single group
            const renderGroup = (groupData) => {
                if (!groupData || groupData.criteria.length === 0) {
                    return '';
                }
                
                const groupCriteria = groupData.criteria;
                const isPenalty = groupData.isPenalty;
                const penaltyClass = isPenalty ? 'penalty' : '';
                const criteriaHeader = groupData.header;
                
                const criteriaHTML = groupCriteria.map(criterion => {
                    const score = this.currentScores[criterion.id] || '';
                    
                    // Get score range: prefer database values, fallback to name-based mapping
                    let minScore, maxScore;
                    if (criterion.min_score != null && criterion.max_score != null) {
                        // Use database values if they exist
                        minScore = criterion.min_score;
                        maxScore = criterion.max_score;
                    } else {
                        // Use name-based mapping
                        const range = getScoreRange(criterion.name);
                        if (range) {
                            minScore = range.min;
                            maxScore = range.max;
                        } else {
                            // If no mapping found, use database defaults or throw error
                            console.warn(`No score range found for criterion: ${criterion.name}`);
                            minScore = criterion.min_score ?? 1;
                            maxScore = criterion.max_score ?? 10;
                        }
                    }
                    
                    return `
                        <div class="criterion-item">
                            <label>${criterion.name} (${minScore}-${maxScore}):</label>
                            <input 
                                type="number" 
                                min="${minScore}" 
                                max="${maxScore}" 
                                step="1"
                                value="${score}" 
                                data-criterion-id="${criterion.id}"
                                data-min-score="${minScore}"
                                data-max-score="${maxScore}"
                                data-is-penalty="${isPenalty}"
                                class="score-input"
                                onchange="JudgeView.updateScore('${criterion.id}', this.value)"
                                oninput="JudgeView.updateScore('${criterion.id}', this.value)"
                            >
                        </div>
                    `;
                }).join('');
                
                // Add penalty indicator text for Preparation group
                const penaltyIndicator = isPenalty ? 
                    '<p class="penalty-indicator">Note: Scores in this group are deducted from the total</p>' : '';
                
                return `
                    <div class="criterion-group ${penaltyClass}">
                        <h3 class="criterion-group-title">${criteriaHeader}</h3>
                        ${penaltyIndicator}
                        <div class="criterion-group-items criterion-group-items-horizontal">
                            ${criteriaHTML}
                        </div>
                    </div>
                `;
            };
            
            // Render criteria inputs grouped by criteria headers
            const container = document.getElementById('criteria-scores');
            let htmlOutput = '';
            
            // Render Content group (full width)
            if (groupedCriteria['Content'] && groupedCriteria['Content'].criteria.length > 0) {
                htmlOutput += renderGroup(groupedCriteria['Content']);
            }
            
            // Render Language and Presentation groups side by side
            const languageGroup = groupedCriteria['Language'];
            const presentationGroup = groupedCriteria['Presentation'];
            const hasLanguage = languageGroup && languageGroup.criteria.length > 0;
            const hasPresentation = presentationGroup && presentationGroup.criteria.length > 0;
            
            if (hasLanguage || hasPresentation) {
                htmlOutput += '<div class="criterion-groups-row">';
                if (hasLanguage) {
                    htmlOutput += renderGroup(languageGroup);
                }
                if (hasPresentation) {
                    htmlOutput += renderGroup(presentationGroup);
                }
                htmlOutput += '</div>';
            }
            
            // Render Preparation group (full width)
            if (groupedCriteria['Preparation'] && groupedCriteria['Preparation'].criteria.length > 0) {
                htmlOutput += renderGroup(groupedCriteria['Preparation']);
            }
            
            container.innerHTML = htmlOutput + 
            // Add ungrouped criteria if any
            (groupedCriteria['Ungrouped'].criteria.length > 0 ? `
                <div class="criterion-group">
                    <h3 class="criterion-group-title">${groupedCriteria['Ungrouped'].header}</h3>
                    <div class="criterion-group-items criterion-group-items-horizontal">
                        ${groupedCriteria['Ungrouped'].criteria.map(criterion => {
                            const score = this.currentScores[criterion.id] || '';
                            
                            // Get score range: prefer database values, fallback to name-based mapping
                            let minScore, maxScore;
                            if (criterion.min_score != null && criterion.max_score != null) {
                                minScore = criterion.min_score;
                                maxScore = criterion.max_score;
                            } else {
                                const range = getScoreRange(criterion.name);
                                if (range) {
                                    minScore = range.min;
                                    maxScore = range.max;
                                } else {
                                    console.warn(`No score range found for criterion: ${criterion.name}`);
                                    minScore = criterion.min_score ?? 1;
                                    maxScore = criterion.max_score ?? 10;
                                }
                            }
                            
                            return `
                                <div class="criterion-item">
                                    <label>${criterion.name} (${minScore}-${maxScore}):</label>
                                    <input 
                                        type="number" 
                                        min="${minScore}" 
                                        max="${maxScore}" 
                                        step="1"
                                        value="${score}" 
                                        data-criterion-id="${criterion.id}"
                                    data-min-score="${minScore}"
                                    data-max-score="${maxScore}"
                                    data-is-penalty="false"
                                    class="score-input"
                                        onchange="JudgeView.updateScore('${criterion.id}', this.value)"
                                        oninput="JudgeView.updateScore('${criterion.id}', this.value)"
                                    >
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : '');

            this.calculateTotal();
            this.updateButtonStates().catch(error => {
                console.error('Error updating button states:', error);
            });
        } catch (error) {
            console.error('Error selecting student:', error);
            alert('Error loading student. Please try again.');
        }
    },

    updateScore(criterionId, value) {
        if (!this.currentStudentId) return;

        const inputElement = document.querySelector(`input[data-criterion-id="${criterionId}"]`);
        
        // Get criterion-specific min/max from input element data attributes
        // These should always be set correctly from the render function
        const minScore = inputElement ? parseInt(inputElement.dataset.minScore) : null;
        const maxScore = inputElement ? parseInt(inputElement.dataset.maxScore) : null;
        
        // If min/max not found, this is an error - should not happen
        if (minScore === null || maxScore === null || isNaN(minScore) || isNaN(maxScore)) {
            console.error(`Score range not found for criterion ${criterionId}`);
            alert('Error: Score range not configured for this criterion. Please refresh the page.');
            return;
        }
        
        // If value is empty, clear the score
        if (value === '' || value === null || value === undefined) {
            this.currentScores[criterionId] = null;
            if (inputElement) {
                inputElement.value = '';
                inputElement.classList.remove('invalid-score');
                inputElement.classList.remove('missing-score');
            }
            this.calculateTotal();
            this.updateButtonStates().catch(error => {
                console.error('Error updating button states:', error);
            });
            return;
        }

        const score = parseInt(value);
        
        // Validate score range based on criterion-specific min/max
        if (isNaN(score) || score < minScore || score > maxScore) {
            // Clear invalid score from storage
            this.currentScores[criterionId] = null;
            
            // Clear and focus the input field
            if (inputElement) {
                inputElement.value = '';
                inputElement.classList.add('invalid-score');
                inputElement.focus();
                alert(`Score must be between ${minScore} and ${maxScore}. Please enter a valid score.`);
            }
            this.calculateTotal();
            this.updateButtonStates().catch(error => {
                console.error('Error updating button states:', error);
            });
            return;
        }

        // Valid score - store it and remove invalid/missing classes
        this.currentScores[criterionId] = score;
        if (inputElement) {
            inputElement.classList.remove('invalid-score');
            inputElement.classList.remove('missing-score');
        }
        this.calculateTotal();
        this.updateButtonStates().catch(error => {
            console.error('Error updating button states:', error);
        });
    },

    /**
     * Validate all scores are within valid range based on criterion-specific min/max
     * @returns {Object} Validation result with isValid flag and invalidCriteria array
     */
    validateAllScores() {
        const invalidCriteria = [];
        
        for (const criterionId in this.currentScores) {
            const score = this.currentScores[criterionId];
            if (score !== null && score !== undefined && score !== '') {
                const inputElement = document.querySelector(`input[data-criterion-id="${criterionId}"]`);
                const minScore = inputElement ? parseInt(inputElement.dataset.minScore) : null;
                const maxScore = inputElement ? parseInt(inputElement.dataset.maxScore) : null;
                
                // Skip validation if score range not found (should not happen)
                if (minScore === null || maxScore === null || isNaN(minScore) || isNaN(maxScore)) {
                    console.warn(`Score range not found for criterion ${criterionId} during validation`);
                    continue;
                }
                
                const numScore = parseInt(score);
                if (isNaN(numScore) || numScore < minScore || numScore > maxScore) {
                    invalidCriteria.push(criterionId);
                }
            }
        }
        
        return {
            isValid: invalidCriteria.length === 0,
            invalidCriteria: invalidCriteria
        };
    },

    /**
     * Update button states based on score validation and submission status
     */
    async updateButtonStates() {
        const validation = this.validateAllScores();
        const saveBtn = document.getElementById('save-scores');
        
        if (!saveBtn) return;
        
        // Check if all students for the grade are submitted
        const user = await AuthManager.getCurrentUser();
        if (user && this.selectedGradeId) {
            let students = await GroupManager.getStudentsForJudge(user.id);
            students = students.filter(s => s.group_id === this.selectedGradeId);
            
            let allSubmitted = true;
            for (const student of students) {
                const submitted = await DataManager.isSubmitted(student.id, user.id);
                if (!submitted) {
                    allSubmitted = false;
                    break;
                }
            }
            
            // If all students are submitted, disable Add score button
            if (allSubmitted) {
                saveBtn.disabled = true;
                saveBtn.classList.add('btn-disabled');
                return;
            }
        }
        
        if (validation.isValid) {
            // Valid scores - enable button
            saveBtn.disabled = false;
            saveBtn.classList.remove('btn-disabled');
        } else {
            // Invalid scores - disable button
            saveBtn.disabled = true;
            saveBtn.classList.add('btn-disabled');
        }
    },

    calculateTotal() {
        let total = 0;
        
        // Calculate total: add regular scores, subtract penalty scores
        for (const criterionId in this.currentScores) {
            const score = this.currentScores[criterionId];
            if (score !== null && score !== undefined && score !== '') {
                const inputElement = document.querySelector(`input[data-criterion-id="${criterionId}"]`);
                const isPenalty = inputElement ? inputElement.dataset.isPenalty === 'true' : false;
                
                if (isPenalty) {
                    // Subtract penalty scores
                    total -= (score || 0);
                } else {
                    // Add regular scores
                    total += (score || 0);
                }
            }
        }
        
        document.getElementById('judge-total-score').textContent = total;
    },

    async addScore() {
        if (!this.currentStudentId) {
            alert('Please select a student first');
            return;
        }

        // Validate all scores before saving
        const validation = this.validateAllScores();
        if (!validation.isValid) {
            const invalidInputs = validation.invalidCriteria.map(id => {
                const input = document.querySelector(`input[data-criterion-id="${id}"]`);
                return input ? input.closest('.criterion-item')?.querySelector('label')?.textContent : 'Unknown';
            }).filter(Boolean);
            
            alert(`Please enter valid scores for all criteria before adding score.\n\nInvalid scores found in: ${invalidInputs.join(', ')}`);
            
            // Focus on first invalid input
            if (validation.invalidCriteria.length > 0) {
                const firstInvalid = document.querySelector(`input[data-criterion-id="${validation.invalidCriteria[0]}"]`);
                if (firstInvalid) {
                    firstInvalid.focus();
                }
            }
            return;
        }

        try {
            const user = await AuthManager.getCurrentUser();
            const criteria = await DataManager.getCriteria();

            // Validate all required criteria are scored (excluding optional criteria: Reading Sentences and Overtime)
            const missingScores = criteria.filter(c => {
                const score = this.currentScores[c.id];
                const criterionNameLower = c.name.toLowerCase();
                const isOptional = criterionNameLower.includes('reading sentences') || 
                                   criterionNameLower.includes('overtime');
                
                // Skip optional criteria from missing scores check
                if (isOptional) {
                    return false;
                }
                
                return !score || score === '';
            });

            if (missingScores.length > 0) {
                // Clear any previous missing-score highlights
                document.querySelectorAll('.score-input.missing-score').forEach(input => {
                    input.classList.remove('missing-score');
                });

                // Highlight missing score fields
                const missingCriteriaNames = [];
                missingScores.forEach(criterion => {
                    const inputElement = document.querySelector(`input[data-criterion-id="${criterion.id}"]`);
                    if (inputElement) {
                        inputElement.classList.add('missing-score');
                        missingCriteriaNames.push(criterion.name);
                    }
                });

                // Show error with missing fields
                alert(`Please enter scores for all required criteria before adding score.\n\nMissing scores:\n${missingCriteriaNames.map((name, index) => `${index + 1}. ${name}`).join('\n')}`);

                // Focus and scroll to first missing field
                if (missingScores.length > 0) {
                    const firstMissingInput = document.querySelector(`input[data-criterion-id="${missingScores[0].id}"]`);
                    if (firstMissingInput) {
                        firstMissingInput.focus();
                        firstMissingInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
                return;
            }

            // Save scores (only valid ones)
            // Use input element data attributes for score ranges (same as validation)
            for (const criterion of criteria) {
                const score = this.currentScores[criterion.id];
                if (score !== null && score !== undefined && score !== '') {
                    const numScore = parseInt(score);
                    const inputElement = document.querySelector(`input[data-criterion-id="${criterion.id}"]`);
                    const minScore = inputElement ? parseInt(inputElement.dataset.minScore) : null;
                    const maxScore = inputElement ? parseInt(inputElement.dataset.maxScore) : null;
                    
                    // Only save if score range is valid and score is within range
                    if (minScore !== null && maxScore !== null && !isNaN(minScore) && !isNaN(maxScore)) {
                        if (!isNaN(numScore) && numScore >= minScore && numScore <= maxScore) {
                            await DataManager.setScore(this.currentStudentId, user.id, criterion.id, numScore);
                        }
                    } else {
                        console.warn(`Cannot save score for criterion ${criterion.id}: score range not found`);
                    }
                }
            }

            // Save notes
            const notesTextarea = document.getElementById('judge-notes-input');
            if (notesTextarea) {
                this.currentNotes = notesTextarea.value || '';
                await DataManager.setNote(this.currentStudentId, user.id, this.currentNotes);
            }

            alert('Score added successfully!');
            await this.renderScoredStudents();
            // updateSubmitAllButtonState is called inside renderScoredStudents
        } catch (error) {
            console.error('Error adding score:', error);
            alert('Error adding score. Please try again.');
        }
    },

    async submitAllScores() {
        try {
            const user = await AuthManager.getCurrentUser();
            if (!user) return;

            // Check if a grade is selected
            if (!this.selectedGradeId) {
                alert('Please select a grade first');
                return;
            }

            // Get all students assigned to judge for the selected grade
            let students = await GroupManager.getStudentsForJudge(user.id);
            students = students.filter(s => s.group_id === this.selectedGradeId);

            if (students.length === 0) {
                alert('No students assigned to this grade');
                return;
            }

            const criteria = await DataManager.getCriteria();
            const pendingStudents = [];

            // Check each student for pending scoring
            for (const student of students) {
                let hasAnyScore = false;
                const missingCriteria = [];

                // Check if student has any scores
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    if (score !== null) {
                        hasAnyScore = true;
                    }
                }

                // If no scores at all, mark as pending
                if (!hasAnyScore) {
                    pendingStudents.push({
                        student: student,
                        reason: 'No scores entered'
                    });
                    continue;
                }

                // Check for missing required criteria scores
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    const criterionNameLower = criterion.name.toLowerCase();
                    const isOptional = criterionNameLower.includes('reading sentences') || 
                                       criterionNameLower.includes('overtime');
                    
                    // Skip optional criteria
                    if (isOptional) {
                        continue;
                    }
                    
                    // If required criterion has no score, add to missing list
                    if (score === null || score === undefined || score === '') {
                        missingCriteria.push(criterion.name);
                    }
                }

                // If missing required scores, mark as pending
                if (missingCriteria.length > 0) {
                    pendingStudents.push({
                        student: student,
                        reason: `Missing: ${missingCriteria.join(', ')}`
                    });
                }
            }

            // If any students are pending, show error
            if (pendingStudents.length > 0) {
                const pendingList = pendingStudents.map((item, index) => 
                    `${index + 1}. ${item.student.name} (${item.reason})`
                ).join('\n');

                alert(`Cannot submit all scores. The following students are pending scoring:\n\n${pendingList}`);
                return;
            }

            // All students are complete - submit all scores
            let submittedCount = 0;
            for (const student of students) {
                try {
                    await DataManager.submitScores(student.id, user.id);
                    submittedCount++;
                } catch (error) {
                    console.error(`Error submitting scores for student ${student.id}:`, error);
                }
            }

            alert(`Successfully submitted scores for ${submittedCount} student(s)!`);
            await this.renderScoredStudents();
            
            // Disable both buttons after successful submission
            await this.disableAllButtons();
            
            // Refresh current student view if one is selected
            if (this.currentStudentId) {
                await this.selectStudent(this.currentStudentId);
            }
        } catch (error) {
            console.error('Error submitting all scores:', error);
            alert('Error submitting all scores. Please try again.');
        }
    },

    async submitScores() {
        if (!this.currentStudentId) {
            alert('Please select a student first');
            return;
        }

        // Validate all scores are within valid range before submitting
        const validation = this.validateAllScores();
        if (!validation.isValid) {
            const invalidInputs = validation.invalidCriteria.map(id => {
                const input = document.querySelector(`input[data-criterion-id="${id}"]`);
                return input ? input.closest('.criterion-item')?.querySelector('label')?.textContent : 'Unknown';
            }).filter(Boolean);
            
            alert(`Please enter valid scores for all criteria before submitting.\n\nInvalid scores found in: ${invalidInputs.join(', ')}`);
            
            // Focus on first invalid input
            if (validation.invalidCriteria.length > 0) {
                const firstInvalid = document.querySelector(`input[data-criterion-id="${validation.invalidCriteria[0]}"]`);
                if (firstInvalid) {
                    firstInvalid.focus();
                }
            }
            return;
        }

        try {
            const user = await AuthManager.getCurrentUser();
            const criteria = await DataManager.getCriteria();

            // Validate all criteria are scored (excluding optional criteria: Reading Sentences and Overtime)
            const missingScores = criteria.filter(c => {
                const score = this.currentScores[c.id];
                const criterionNameLower = c.name.toLowerCase();
                const isOptional = criterionNameLower.includes('reading sentences') || 
                                   criterionNameLower.includes('overtime');
                
                // Skip optional criteria from missing scores check
                if (isOptional) {
                    return false;
                }
                
                return !score || score === '';
            });

            if (missingScores.length > 0) {
                // Clear any previous missing-score highlights
                document.querySelectorAll('.score-input.missing-score').forEach(input => {
                    input.classList.remove('missing-score');
                });

                // Highlight missing score fields in RED
                const missingCriteriaNames = [];
                missingScores.forEach(criterion => {
                    const inputElement = document.querySelector(`input[data-criterion-id="${criterion.id}"]`);
                    if (inputElement) {
                        inputElement.classList.add('missing-score');
                        missingCriteriaNames.push(criterion.name);
                    }
                });

                // Show alert with missing fields
                alert(`Please enter scores for all required criteria before submitting.\n\nMissing scores:\n${missingCriteriaNames.map((name, index) => `${index + 1}. ${name}`).join('\n')}`);

                // Focus and scroll to first missing field
                if (missingScores.length > 0) {
                    const firstMissingInput = document.querySelector(`input[data-criterion-id="${missingScores[0].id}"]`);
                    if (firstMissingInput) {
                        firstMissingInput.focus();
                        firstMissingInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }

                return; // Prevent submission - DO NOT PROCEED
            }

            // Save all scores (only valid ones)
            // Use input element data attributes for score ranges (same as validation)
            for (const criterion of criteria) {
                const score = this.currentScores[criterion.id];
                if (score !== null && score !== undefined && score !== '') {
                    const numScore = parseInt(score);
                    const inputElement = document.querySelector(`input[data-criterion-id="${criterion.id}"]`);
                    const minScore = inputElement ? parseInt(inputElement.dataset.minScore) : null;
                    const maxScore = inputElement ? parseInt(inputElement.dataset.maxScore) : null;
                    
                    // Only save if score range is valid and score is within range
                    if (minScore !== null && maxScore !== null && !isNaN(minScore) && !isNaN(maxScore)) {
                        if (!isNaN(numScore) && numScore >= minScore && numScore <= maxScore) {
                            await DataManager.setScore(this.currentStudentId, user.id, criterion.id, numScore);
                        }
                    } else {
                        console.warn(`Cannot save score for criterion ${criterion.id}: score range not found`);
                    }
                }
            }

            // Save notes
            const notesTextarea = document.getElementById('judge-notes-input');
            if (notesTextarea) {
                this.currentNotes = notesTextarea.value || '';
                await DataManager.setNote(this.currentStudentId, user.id, this.currentNotes);
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

    /**
     * Check if a criterion is a penalty criterion (belongs to Preparation group)
     * @param {Object} criterion - The criterion object
     * @returns {boolean} - True if penalty, false otherwise
     */
    isPenaltyCriterion(criterion) {
        // Check if criterion has group info with is_penalty flag
        if (criterion.group?.is_penalty === true) {
            return true;
        }
        
        // Check by criterion name (Preparation group criteria)
        const criterionNameLower = criterion.name.toLowerCase();
        const penaltyCriteriaNames = ['reading sentences', 'overtime', 'preparation'];
        return penaltyCriteriaNames.some(name => criterionNameLower.includes(name));
    },

    async renderScoredStudents() {
        try {
            const user = await AuthManager.getCurrentUser();
            const container = document.getElementById('scored-students-list');
            
            if (!container) {
                console.error('Scored students container not found');
                return;
            }
            
            // Clear container immediately to prevent showing stale data
            container.innerHTML = '<p class="empty-message">Loading...</p>';
            
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
            
            if (students.length === 0) {
                container.innerHTML = '<p class="empty-message">No students assigned to this grade.</p>';
                return;
            }
            
            const criteria = await DataManager.getCriteria();

            // Filter to only show students with at least one score
            const scoredStudents = [];
            for (const student of students) {
                let hasAnyScore = false;
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    if (score !== null) {
                        hasAnyScore = true;
                        break;
                    }
                }
                if (hasAnyScore) {
                    scoredStudents.push(student);
                }
            }

            if (scoredStudents.length === 0) {
                container.innerHTML = '<p class="empty-message">No students scored yet.</p>';
                // Update Submit All button state
                await this.updateSubmitAllButtonState();
                return;
            }

            const cards = await Promise.all(scoredStudents.map(async student => {
                const submitted = await DataManager.isSubmitted(student.id, user.id);
                let total = 0;
                
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    if (score !== null) {
                        // Check if this is a penalty criterion (Preparation group)
                        const isPenalty = this.isPenaltyCriterion(criterion);
                        
                        if (isPenalty) {
                            // Subtract penalty scores
                            total -= score;
                        } else {
                            // Add regular scores
                            total += score;
                        }
                    }
                }

                const viewNotesButton = `<button class="btn btn-sm btn-primary" onclick="JudgeView.showNotesModal('${student.id}', '${student.name}')" style="margin-top: 10px;">View Notes</button>`;

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
                        ${viewNotesButton}
                    </div>
                `;
            }));

            container.innerHTML = cards.join('');
            
            // Update Submit All button state
            await this.updateSubmitAllButtonState();
        } catch (error) {
            console.error('Error rendering scored students:', error);
            const container = document.getElementById('scored-students-list');
            if (container) {
                container.innerHTML = '<p class="empty-message">Error loading scored students.</p>';
            }
            // Still update button state even on error
            await this.updateSubmitAllButtonState();
        }
    },

    /**
     * Update Submit All button state based on whether all students are scored and submitted
     */
    async updateSubmitAllButtonState() {
        try {
            const submitAllBtn = document.getElementById('submit-all-scores');
            const addScoreBtn = document.getElementById('save-scores');
            
            if (!submitAllBtn) return;

            const user = await AuthManager.getCurrentUser();
            if (!user) return;

            // Check if a grade is selected
            if (!this.selectedGradeId) {
                submitAllBtn.disabled = true;
                submitAllBtn.classList.add('btn-disabled');
                if (addScoreBtn) {
                    addScoreBtn.disabled = true;
                    addScoreBtn.classList.add('btn-disabled');
                }
                return;
            }

            // Get all students assigned to judge for the selected grade
            let students = await GroupManager.getStudentsForJudge(user.id);
            students = students.filter(s => s.group_id === this.selectedGradeId);

            if (students.length === 0) {
                submitAllBtn.disabled = true;
                submitAllBtn.classList.add('btn-disabled');
                if (addScoreBtn) {
                    addScoreBtn.disabled = true;
                    addScoreBtn.classList.add('btn-disabled');
                }
                return;
            }

            const criteria = await DataManager.getCriteria();

            // Check if all students are submitted
            let allSubmitted = true;
            for (const student of students) {
                const submitted = await DataManager.isSubmitted(student.id, user.id);
                if (!submitted) {
                    allSubmitted = false;
                    break;
                }
            }

            // If all students are submitted, disable both buttons
            if (allSubmitted) {
                submitAllBtn.disabled = true;
                submitAllBtn.classList.add('btn-disabled');
                if (addScoreBtn) {
                    addScoreBtn.disabled = true;
                    addScoreBtn.classList.add('btn-disabled');
                }
                return;
            }

            // Check if all students have at least one score
            let allScored = true;
            for (const student of students) {
                let hasAnyScore = false;
                for (const criterion of criteria) {
                    const score = await DataManager.getScore(student.id, user.id, criterion.id);
                    if (score !== null) {
                        hasAnyScore = true;
                        break;
                    }
                }
                if (!hasAnyScore) {
                    allScored = false;
                    break;
                }
            }

            // Enable Submit All button only if all students are scored (but not yet submitted)
            if (allScored) {
                submitAllBtn.disabled = false;
                submitAllBtn.classList.remove('btn-disabled');
            } else {
                submitAllBtn.disabled = true;
                submitAllBtn.classList.add('btn-disabled');
            }
            
            // Add score button state is managed by updateButtonStates()
        } catch (error) {
            console.error('Error updating Submit All button state:', error);
            // On error, disable button to be safe
            const submitAllBtn = document.getElementById('submit-all-scores');
            const addScoreBtn = document.getElementById('save-scores');
            if (submitAllBtn) {
                submitAllBtn.disabled = true;
                submitAllBtn.classList.add('btn-disabled');
            }
            if (addScoreBtn) {
                addScoreBtn.disabled = true;
                addScoreBtn.classList.add('btn-disabled');
            }
        }
    },

    /**
     * Disable both Submit All and Add score buttons
     */
    async disableAllButtons() {
        const submitAllBtn = document.getElementById('submit-all-scores');
        const addScoreBtn = document.getElementById('save-scores');
        
        if (submitAllBtn) {
            submitAllBtn.disabled = true;
            submitAllBtn.classList.add('btn-disabled');
        }
        
        if (addScoreBtn) {
            addScoreBtn.disabled = true;
            addScoreBtn.classList.add('btn-disabled');
        }
    },

    /**
     * Show notes modal for viewing/editing notes
     */
    async showNotesModal(studentId, studentName) {
        try {
            const user = await AuthManager.getCurrentUser();
            if (!user) return;

            const notes = await DataManager.getNote(studentId, user.id);
            const modal = document.getElementById('notes-modal');
            const modalTitle = document.getElementById('notes-modal-title');
            const modalTextarea = document.getElementById('notes-modal-textarea');

            modalTitle.textContent = `Notes for ${studentName}`;
            modalTextarea.value = notes || '';
            modal.dataset.studentId = studentId;
            modal.style.display = 'flex';
        } catch (error) {
            console.error('Error showing notes modal:', error);
            alert('Error loading notes. Please try again.');
        }
    },

    /**
     * Hide notes modal
     */
    hideNotesModal() {
        const modal = document.getElementById('notes-modal');
        modal.style.display = 'none';
        delete modal.dataset.studentId;
    },

    /**
     * Save notes from modal
     */
    async saveNotesFromModal() {
        try {
            const modal = document.getElementById('notes-modal');
            const studentId = modal.dataset.studentId;
            const modalTextarea = document.getElementById('notes-modal-textarea');

            if (!studentId) {
                alert('Error: Student ID not found');
                return;
            }

            const user = await AuthManager.getCurrentUser();
            if (!user) return;

            const notes = modalTextarea.value || '';
            await DataManager.setNote(studentId, user.id, notes);

            // If this is the currently selected student, update the main textarea
            if (this.currentStudentId === studentId) {
                const notesTextarea = document.getElementById('judge-notes-input');
                if (notesTextarea) {
                    notesTextarea.value = notes;
                    this.currentNotes = notes;
                }
            }

            alert('Notes saved successfully!');
            this.hideNotesModal();
            await this.renderScoredStudents();
        } catch (error) {
            console.error('Error saving notes:', error);
            alert('Error saving notes. Please try again.');
        }
    }
};

