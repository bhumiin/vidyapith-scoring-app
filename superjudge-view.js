/**
 * Super Judge View Module
 * Handles the super judge review interface
 */

const SuperJudgeView = {
    selectedGradeId: null,
    selectedGroupIdForManagement: null,
    currentEditingStudent: null,
    currentEditingJudge: null,
    _listenersInitialized: false,

    async init() {
        this.setupEventListeners();
        await this.render();
    },

    setupEventListeners() {
        if (this._listenersInitialized) {
            return;
        }
        // Tab switching
        document.querySelectorAll('#superjudge-view .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Group management
        // Event delegation for group list items
        document.getElementById('superjudge-groups-list-container').addEventListener('click', (e) => {
            const groupItem = e.target.closest('.group-list-item');
            if (groupItem && !e.target.closest('.delete-group-btn')) {
                const groupId = groupItem.dataset.groupId;
                this.onGroupSelectionChange(groupId).catch(error => console.error('Error on group selection:', error));
            }
        });
        document.getElementById('superjudge-group-judge-search').addEventListener('input', (e) => {
            this.onJudgeSearchChange(e.target.value).catch(error => console.error('Error on judge search:', error));
        });
        document.getElementById('superjudge-assign-judges-btn').addEventListener('click', () => {
            this.assignSelectedJudgesToGroup(this.selectedGroupIdForManagement).catch(error => console.error('Error assigning judges:', error));
        });
        document.getElementById('superjudge-select-all-judges').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('#superjudge-judge-checkbox-list .judge-checkbox:not(:disabled)');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
        // Event delegation for judge checkboxes to update select all state
        document.getElementById('superjudge-judge-checkbox-list').addEventListener('change', (e) => {
            if (e.target.classList.contains('judge-checkbox')) {
                this.updateSelectAllJudgesState();
            }
        });

        // Export
        document.getElementById('export-csv').addEventListener('click', () => {
            DataManager.exportToCSV().catch(error => console.error('Error exporting CSV:', error));
        });
        document.getElementById('export-excel').addEventListener('click', () => {
            DataManager.exportToExcel().catch(error => console.error('Error exporting Excel:', error));
        });

        // Logout
        document.getElementById('superjudge-logout').addEventListener('click', () => {
            AuthManager.logout();
            App.showView('login');
        });

        this._listenersInitialized = true;
    },

    async switchTab(tabName) {
        document.querySelectorAll('#superjudge-view .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#superjudge-view .tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`#superjudge-view [data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        if (tabName === 'scores') {
            await this.renderGradeButtons();
            await this.renderStudents();
        } else if (tabName === 'group-management') {
            await this.renderGroups();
        }
    },

    async render() {
        // Display super judge name
        const session = AuthManager.getSession();
        if (session && session.name) {
            document.getElementById('superjudge-name-display').textContent = session.name;
        }

        // Hide grades display for super judge
        document.getElementById('superjudge-groups-info').style.display = 'none';

        await this.renderGradeButtons();
        await this.renderStudents();
        await this.renderGroups();
    },

    async renderGradeButtons() {
        try {
            const groups = await DataManager.getGroups();
            const container = document.getElementById('grade-buttons-container');
            
            if (!groups || groups.length === 0) {
                container.innerHTML = '<p class="empty-message">No grades available.</p>';
                return;
            }

            // Sort groups in ascending order by name
            const sortedGroups = [...groups].sort((a, b) => {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });

            const buttonsHTML = sortedGroups.map(group => {
                const isActive = this.selectedGradeId === group.id;
                return `
                    <button 
                        class="grade-button ${isActive ? 'active' : ''}" 
                        data-grade-id="${group.id}"
                        onclick="SuperJudgeView.selectGrade('${group.id}')"
                    >
                        Grade ${group.name}
                    </button>
                `;
            }).join('');

            container.innerHTML = `<div class="grade-buttons-grid">${buttonsHTML}</div>`;
        } catch (error) {
            console.error('Error rendering grade buttons:', error);
        }
    },

    async selectGrade(gradeId) {
        this.selectedGradeId = gradeId;
        await this.renderGradeButtons();
        await this.renderStudents();
    },

    async renderStudents() {
        try {
            const container = document.getElementById('superjudge-students-list');
            
            // If no grade is selected, show empty message
            if (!this.selectedGradeId) {
                container.innerHTML = '<p class="empty-message">Select a grade to view students</p>';
                return;
            }

            let students = await DataManager.getStudents();
            
            // Filter by selected grade
            students = students.filter(s => s.group_id === this.selectedGradeId);

            await this.renderStudentsList(students);
        } catch (error) {
            console.error('Error rendering students:', error);
        }
    },

    async renderStudentsList(students) {
        const container = document.getElementById('superjudge-students-list');
        
        if (students.length === 0) {
            container.innerHTML = '<p class="empty-message">No students found.</p>';
            return;
        }

        try {
            const groups = await DataManager.getGroups();
            const judges = await DataManager.getJudges();
            const criteria = await DataManager.getCriteria();

            const studentCards = await Promise.all(students.map(async student => {
                const group = groups.find(g => g.id === student.group_id);
                const groupName = group ? group.name : 'Unassigned';
                const groupJudges = await GroupManager.getJudgesForStudent(student.id);
                const allSubmitted = await GroupManager.allJudgesSubmittedForStudent(student.id);

                // Calculate scores
                let totalScore = 0;
                const judgeScores = await Promise.all(groupJudges.map(async judge => {
                    let judgeTotal = 0;
                    const scores = await Promise.all(criteria.map(async criterion => {
                        const score = await DataManager.getScore(student.id, judge.id, criterion.id);
                        if (score !== null) {
                            judgeTotal += score;
                        }
                        return {
                            criterion: criterion.name,
                            score: score
                        };
                    }));
                    totalScore += judgeTotal;
                    const submitted = await DataManager.isSubmitted(student.id, judge.id);
                    return {
                        judge: judge,
                        scores: scores,
                        total: judgeTotal,
                        submitted: submitted
                    };
                }));

                const avgScore = groupJudges.length > 0 ? (totalScore / groupJudges.length).toFixed(2) : 0;

                return `
                    <div class="student-score-card">
                        <div class="student-score-header">
                            <h3>${student.name}</h3>
                            <span class="badge">Grade: ${groupName}</span>
                            <span class="badge ${allSubmitted ? 'badge-success' : 'badge-warning'}">
                                ${allSubmitted ? 'All Judges Submitted' : 'Pending'}
                            </span>
                        </div>
                        ${allSubmitted ? `
                            <div class="score-summary">
                                <div class="summary-item">
                                    <strong>Total Score:</strong> ${totalScore}
                                </div>
                                <div class="summary-item">
                                    <strong>Average Score:</strong> ${avgScore}
                                </div>
                                <div class="summary-item">
                                    <strong>Number of Judges:</strong> ${groupJudges.length}
                                </div>
                            </div>
                            <div class="judge-scores-detail">
                                ${judgeScores.map(js => `
                                    <div class="judge-score-item">
                                        <div class="judge-score-header">
                                            <strong>${js.judge.name}</strong>
                                            <span class="badge">Total: ${js.total}</span>
                                            <button class="btn btn-sm btn-primary" onclick="SuperJudgeView.editJudgeScores('${student.id}', '${js.judge.id}')">Edit</button>
                                        </div>
                                        <div class="criterion-scores">
                                            ${js.scores.map(s => `
                                                <span class="criterion-badge">
                                                    ${s.criterion}: ${s.score !== null ? s.score : 'N/A'}
                                                </span>
                                            `).join('')}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="pending-message">
                                <p>Waiting for all judges to submit scores.</p>
                                <p>Submitted: ${judgeScores.filter(js => js.submitted).length} / ${groupJudges.length}</p>
                            </div>
                        `}
                    </div>
                `;
            }));

            container.innerHTML = studentCards.join('');
        } catch (error) {
            console.error('Error rendering students list:', error);
            container.innerHTML = '<p class="empty-message">Error loading students.</p>';
        }
    },

    async editJudgeScores(studentId, judgeId) {
        this.currentEditingStudent = studentId;
        this.currentEditingJudge = judgeId;
        try {
            const students = await DataManager.getStudents();
            const judges = await DataManager.getJudges();
            const student = students.find(s => s.id === studentId);
            const judge = judges.find(j => j.id === judgeId);
            const criteria = await DataManager.getCriteria();

            // Unlock scores first
            await DataManager.unlockScores(studentId, judgeId);

            // Create modal for editing
            const modal = document.createElement('div');
            modal.className = 'modal';
            
            // Load scores for criteria
            const scoreInputs = await Promise.all(criteria.map(async criterion => {
                const score = await DataManager.getScore(studentId, judgeId, criterion.id);
                return `
                    <div class="criterion-score-item">
                        <label>${criterion.name} (1-10):</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="10" 
                            value="${score || ''}" 
                            data-criterion-id="${criterion.id}"
                            class="score-input"
                            onchange="SuperJudgeView.updateEditScore('${criterion.id}', this.value)"
                        >
                    </div>
                `;
            }));

            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Edit Scores: ${student.name} - ${judge.name}</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        ${scoreInputs.join('')}
                        <div class="modal-actions">
                            <button class="btn btn-primary" onclick="SuperJudgeView.saveEditScores()">Save</button>
                            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } catch (error) {
            console.error('Error editing judge scores:', error);
            alert('Error loading scores for editing. Please try again.');
        }
    },

    updateEditScore(criterionId, value) {
        const score = parseInt(value);
        if (isNaN(score) || score < 1 || score > 10) {
            if (value !== '') {
                alert('Score must be between 1 and 10');
                return;
            }
        }
    },

    async saveEditScores() {
        if (!this.currentEditingStudent || !this.currentEditingJudge) return;

        try {
            const criteria = await DataManager.getCriteria();
            const modal = document.querySelector('.modal');
            const inputs = modal.querySelectorAll('.score-input');

            for (const input of inputs) {
                const criterionId = input.dataset.criterionId;
                const value = input.value;
                if (value && value !== '') {
                    const score = parseInt(value);
                    if (score >= 1 && score <= 10) {
                        await DataManager.setScore(this.currentEditingStudent, this.currentEditingJudge, criterionId, score);
                    }
                }
            }

            // Re-submit scores
            await DataManager.submitScores(this.currentEditingStudent, this.currentEditingJudge);

            modal.remove();
            await this.renderStudents();
        } catch (error) {
            console.error('Error saving edit scores:', error);
            alert('Error saving scores. Please try again.');
        }
    },

    async renderGroups() {
        await this.renderGroupAssignmentUI();
    },

    async renderGroupAssignmentUI() {
        try {
            const groups = await DataManager.getGroups() || [];
            const groupsListContainer = document.getElementById('superjudge-groups-list-container');
            
            // Sort groups in ascending order by name
            const sortedGroups = [...groups].sort((a, b) => {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });
            
            // Store currently selected group ID
            const currentSelectedGroupId = this.selectedGroupIdForManagement || null;
            
            // Fetch judge counts for each group
            const groupsWithJudgeCounts = await Promise.all(sortedGroups.map(async (group) => {
                const judgeIds = await SupabaseService.getGroupJudges(group.id);
                return {
                    ...group,
                    judgeCount: judgeIds.length
                };
            }));
            
            // Render groups list
            if (groupsWithJudgeCounts.length === 0) {
                groupsListContainer.innerHTML = '<p class="empty-message">No grades created yet.</p>';
            } else {
                groupsListContainer.innerHTML = groupsWithJudgeCounts.map(group => {
                    const isSelected = currentSelectedGroupId === group.id;
                    return `
                        <div class="group-list-item ${isSelected ? 'selected' : ''}" data-group-id="${group.id}">
                            <div class="group-list-item-content">
                                <strong>${group.name}</strong>
                                <span class="group-student-count">${group.judgeCount} judges</span>
                            </div>
                            <button class="btn btn-danger btn-sm delete-group-btn" onclick="event.stopPropagation(); SuperJudgeView.deleteGroup('${group.id}')">Delete</button>
                        </div>
                    `;
                }).join('');
            }
            
            // Render selected group's judges if a group is selected
            if (currentSelectedGroupId) {
                await this.renderSelectedGroupJudges(currentSelectedGroupId);
            } else {
                document.getElementById('superjudge-selected-group-info').style.display = 'none';
                document.getElementById('superjudge-no-group-selected').style.display = 'block';
            }
            
            // Render judge checkboxes for adding
            const searchTerm = document.getElementById('superjudge-group-judge-search')?.value || '';
            await this.renderJudgeCheckboxes(currentSelectedGroupId, searchTerm);
            
            // Update assign button state
            const assignBtn = document.getElementById('superjudge-assign-judges-btn');
            if (assignBtn) {
                assignBtn.disabled = !currentSelectedGroupId;
            }
        } catch (error) {
            console.error('Error rendering group assignment UI:', error);
        }
    },

    async renderSelectedGroupJudges(groupId) {
        try {
            const groups = await DataManager.getGroups();
            const group = groups.find(g => g.id === groupId);
            if (!group) return;
            
            // Fetch judge IDs assigned to this group
            const judgeIds = await SupabaseService.getGroupJudges(groupId);
            const allJudges = await DataManager.getJudges() || [];
            const groupJudges = allJudges.filter(j => judgeIds.includes(j.id));
            
            const selectedGroupInfo = document.getElementById('superjudge-selected-group-info');
            const selectedGroupName = document.getElementById('superjudge-selected-group-name');
            const groupJudgesList = document.getElementById('superjudge-group-judges-list');
            const noGroupSelected = document.getElementById('superjudge-no-group-selected');
            
            selectedGroupInfo.style.display = 'block';
            noGroupSelected.style.display = 'none';
            selectedGroupName.textContent = group.name;
            
            if (groupJudges.length === 0) {
                groupJudgesList.innerHTML = '<p class="empty-message">No judges assigned to this grade.</p>';
            } else {
                groupJudgesList.innerHTML = groupJudges.map(judge => `
                    <div class="group-student-item">
                        <span class="student-name">${judge.name}</span>
                        <button class="btn btn-danger btn-sm" onclick="SuperJudgeView.removeJudgeFromGroup('${judge.id}', '${groupId}')">Remove</button>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error rendering selected group judges:', error);
        }
    },

    async renderJudgeCheckboxes(selectedGroupId, searchTerm) {
        try {
            const judges = await DataManager.getJudges() || [];
            const container = document.getElementById('superjudge-judge-checkbox-list');
            if (!container) return;
            
            // Get selected group's judge IDs from database
            const groupJudgeIds = selectedGroupId ? await SupabaseService.getGroupJudges(selectedGroupId) : [];
            
            // Filter judges by search term
            const filteredJudges = judges.filter(judge => 
                judge.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
            
            if (filteredJudges.length === 0) {
                container.innerHTML = '<p class="empty-message">No judges found.</p>';
                return;
            }
            
            // Render checkboxes
            container.innerHTML = filteredJudges.map(judge => {
                const isChecked = selectedGroupId && groupJudgeIds.includes(judge.id);
                
                return `
                    <div class="student-checkbox-item">
                        <label>
                            <input type="checkbox" 
                                   value="${judge.id}" 
                                   class="judge-checkbox"
                                   ${isChecked ? 'checked' : ''}
                                   ${!selectedGroupId ? 'disabled' : ''}>
                            <span class="student-name">${judge.name}</span>
                        </label>
                    </div>
                `;
            }).join('');
            
            // Update select all checkbox
            const selectAllCheckbox = document.getElementById('superjudge-select-all-judges');
            if (selectAllCheckbox && selectedGroupId && filteredJudges.length > 0) {
                const allChecked = filteredJudges.every(j => groupJudgeIds.includes(j.id));
                const someChecked = filteredJudges.some(j => groupJudgeIds.includes(j.id));
                selectAllCheckbox.checked = allChecked;
                selectAllCheckbox.indeterminate = someChecked && !allChecked;
            } else if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }
        } catch (error) {
            console.error('Error rendering judge checkboxes:', error);
        }
    },

    async onGroupSelectionChange(groupId) {
        this.selectedGroupIdForManagement = groupId;
        const searchTerm = document.getElementById('superjudge-group-judge-search')?.value || '';
        await this.renderJudgeCheckboxes(groupId, searchTerm);
        await this.renderSelectedGroupJudges(groupId);
        
        // Update assign button state
        const assignBtn = document.getElementById('superjudge-assign-judges-btn');
        if (assignBtn) {
            assignBtn.disabled = !groupId;
        }
        
        // Update groups list to show selected state
        const groups = await DataManager.getGroups() || [];
        // Sort groups in ascending order by name
        const sortedGroups = [...groups].sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        // Fetch judge counts for each group
        const groupsWithJudgeCounts = await Promise.all(sortedGroups.map(async (group) => {
            const judgeIds = await SupabaseService.getGroupJudges(group.id);
            return {
                ...group,
                judgeCount: judgeIds.length
            };
        }));
        
        const groupsListContainer = document.getElementById('superjudge-groups-list-container');
        if (groupsWithJudgeCounts.length > 0) {
            groupsListContainer.innerHTML = groupsWithJudgeCounts.map(group => {
                const isSelected = this.selectedGroupIdForManagement === group.id;
                return `
                    <div class="group-list-item ${isSelected ? 'selected' : ''}" data-group-id="${group.id}">
                        <div class="group-list-item-content">
                            <strong>${group.name}</strong>
                            <span class="group-student-count">${group.judgeCount} judges</span>
                        </div>
                        <button class="btn btn-danger btn-sm delete-group-btn" onclick="event.stopPropagation(); SuperJudgeView.deleteGroup('${group.id}')">Delete</button>
                    </div>
                `;
            }).join('');
        }
    },

    async onJudgeSearchChange(searchTerm) {
        const groupId = this.selectedGroupIdForManagement;
        await this.renderJudgeCheckboxes(groupId, searchTerm);
    },

    async assignSelectedJudgesToGroup(groupId) {
        if (!groupId) {
            alert('Please select a grade first');
            return;
        }
        
        const checkboxes = document.querySelectorAll('#superjudge-judge-checkbox-list .judge-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('Please select at least one judge');
            return;
        }
        
        const judgeIds = Array.from(checkboxes).map(cb => cb.value);
        
        try {
            // Assign each selected judge to the group
            for (const judgeId of judgeIds) {
                await GroupManager.assignJudgeToGroup(judgeId, groupId);
            }
            
            // Re-render the UI
            const searchTerm = document.getElementById('superjudge-group-judge-search')?.value || '';
            await this.renderJudgeCheckboxes(groupId, searchTerm);
            await this.renderSelectedGroupJudges(groupId);
            await this.renderGroupAssignmentUI();
        } catch (error) {
            console.error('Error assigning judges to group:', error);
            alert('Error assigning judges. Please try again.');
        }
    },

    updateSelectAllJudgesState() {
        const checkboxes = document.querySelectorAll('#superjudge-judge-checkbox-list .judge-checkbox:not(:disabled)');
        if (checkboxes.length === 0) return;
        
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        const selectAllCheckbox = document.getElementById('superjudge-select-all-judges');
        
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = someChecked && !allChecked;
        }
    },

    async addGroup() {
        const name = document.getElementById('superjudge-group-name').value.trim();
        if (!name) {
            alert('Please enter a grade name');
            return;
        }

        try {
            await GroupManager.createGroup(name);
            document.getElementById('superjudge-group-name').value = '';
            await this.renderGroups();
            await this.renderGradeButtons();
        } catch (error) {
            console.error('Error adding group:', error);
            alert('Error creating group. Please try again.');
        }
    },

    updateGroupJudges(groupId) {
        const select = document.getElementById(`superjudge-judge-select-${groupId}`);
        const selectedJudges = Array.from(select.selectedOptions).map(opt => opt.value);
        const group = DataManager.getGroups().find(g => g.id === groupId);
        if (!group) return;

        const allJudges = DataManager.getJudges() || [];
        
        // Remove judges not selected
        group.judgeIds.forEach(judgeId => {
            if (!selectedJudges.includes(judgeId)) {
                GroupManager.removeJudgeFromGroup(judgeId, groupId);
            }
        });

        // Add newly selected judges
        selectedJudges.forEach(judgeId => {
            if (!group.judgeIds.includes(judgeId)) {
                GroupManager.assignJudgeToGroup(judgeId, groupId);
            }
        });

        this.renderGroups();
    },

    async removeJudgeFromGroup(judgeId, groupId) {
        try {
            await GroupManager.removeJudgeFromGroup(judgeId, groupId);
            // Refresh the selected group's judges list
            if (this.selectedGroupIdForManagement === groupId) {
                await this.renderSelectedGroupJudges(groupId);
            }
            // Re-render judge checkboxes to update their state
            const searchTerm = document.getElementById('superjudge-group-judge-search')?.value || '';
            await this.renderJudgeCheckboxes(this.selectedGroupIdForManagement, searchTerm);
            // Re-render groups list to update judge counts
            await this.renderGroupAssignmentUI();
        } catch (error) {
            console.error('Error removing judge from group:', error);
            alert('Error removing judge. Please try again.');
        }
    },

    async deleteGroup(id) {
        if (confirm('Are you sure you want to delete this grade? All student assignments will be removed.')) {
            try {
                await GroupManager.deleteGroup(id);
                // Clear selection if deleted group was selected
                if (this.selectedGroupIdForManagement === id) {
                    this.selectedGroupIdForManagement = null;
                }
                await this.renderGroups();
                await this.renderGradeButtons();
                await this.renderStudents();
            } catch (error) {
                console.error('Error deleting group:', error);
                alert('Error deleting group. Please try again.');
            }
        }
    }
};

