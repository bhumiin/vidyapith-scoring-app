/**
 * Setup View Module (Admin)
 * Handles the admin setup interface
 */

const SetupView = {
    selectedGroupId: null,
    selectedJudgeId: null,
    
    async init() {
        this.setupEventListeners();
        await this.render();
    },

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Students
        document.getElementById('add-student-manual').addEventListener('click', () => this.addStudentManual().catch(error => console.error('Error adding student:', error)));
        document.getElementById('student-search').addEventListener('input', (e) => this.filterStudents(e.target.value).catch(error => console.error('Error filtering students:', error)));

        // Judges
        document.getElementById('add-judge').addEventListener('click', () => this.addJudge().catch(error => console.error('Error adding judge:', error)));
        // Event delegation for judge list items
        document.getElementById('judges-list-container').addEventListener('click', (e) => {
            const judgeItem = e.target.closest('.group-list-item');
            if (judgeItem && !e.target.closest('.delete-judge-btn')) {
                const judgeId = judgeItem.dataset.judgeId;
                this.onJudgeSelectionChange(judgeId).catch(error => console.error('Error selecting judge:', error));
            }
        });
        document.getElementById('judge-group-search').addEventListener('input', (e) => {
            this.onGroupSearchChange(e.target.value).catch(error => console.error('Error searching groups:', error));
        });
        document.getElementById('assign-groups-btn').addEventListener('click', () => {
            this.assignSelectedGroupsToJudge(this.selectedJudgeId).catch(error => console.error('Error assigning groups:', error));
        });
        document.getElementById('select-all-groups').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.group-checkbox:not(:disabled)');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
        // Event delegation for group checkboxes to update select all state
        document.getElementById('group-checkbox-list').addEventListener('change', (e) => {
            if (e.target.classList.contains('group-checkbox')) {
                this.updateSelectAllGroupsState();
            }
        });

        // Super Judges
        document.getElementById('add-superjudge').addEventListener('click', () => this.addSuperJudge().catch(error => console.error('Error adding super judge:', error)));

        // Criteria
        document.getElementById('add-criterion').addEventListener('click', () => this.addCriterion().catch(error => console.error('Error adding criterion:', error)));

        // Groups
        // Event delegation for group list items
        document.getElementById('groups-list-container').addEventListener('click', (e) => {
            const groupItem = e.target.closest('.group-list-item');
            if (groupItem && !e.target.closest('.delete-group-btn')) {
                const groupId = groupItem.dataset.groupId;
                this.onGroupSelectionChange(groupId).catch(error => console.error('Error selecting group:', error));
            }
        });
        document.getElementById('group-judge-search').addEventListener('input', (e) => {
            this.onJudgeSearchChange(e.target.value).catch(error => console.error('Error searching judges:', error));
        });
        document.getElementById('assign-judges-btn').addEventListener('click', () => {
            this.assignSelectedJudgesToGroup(this.selectedGroupId).catch(error => console.error('Error assigning judges:', error));
        });
        document.getElementById('select-all-judges').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.judge-checkbox:not(:disabled)');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
        // Event delegation for judge checkboxes to update select all state
        document.getElementById('judge-checkbox-list').addEventListener('change', (e) => {
            if (e.target.classList.contains('judge-checkbox')) {
                this.updateSelectAllJudgesState();
            }
        });

        // Import/Export
        document.getElementById('export-config').addEventListener('click', () => DataManager.exportConfig().catch(error => console.error('Error exporting config:', error)));
        document.getElementById('import-config').addEventListener('click', () => this.importConfig().catch(error => console.error('Error importing config:', error)));
        document.getElementById('import-spreadsheet').addEventListener('click', () => this.importStudentsFromSpreadsheet().catch(error => console.error('Error importing spreadsheet:', error)));
        document.getElementById('import-judges').addEventListener('click', () => this.importJudgesFromSpreadsheet().catch(error => console.error('Error importing judges:', error)));

        // Logout
        document.getElementById('setup-logout').addEventListener('click', () => {
            AuthManager.logout();
            App.showView('login');
        });
    },

    async switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Re-render current tab
        if (tabName === 'students') await this.renderStudents();
        else if (tabName === 'judges') await this.renderJudges();
        else if (tabName === 'superjudges') await this.renderSuperJudges();
        else if (tabName === 'criteria') await this.renderCriteria();
        else if (tabName === 'groups') await this.renderGroups();
    },

    async render() {
        await this.renderStudents();
        await this.renderJudges();
        await this.renderSuperJudges();
        await this.renderCriteria();
        await this.renderGroups();
    },

    // Students
    async addStudentManual() {
        const nameInput = document.getElementById('student-name-input');
        const gradeInput = document.getElementById('student-grade-input');
        const name = nameInput.value.trim();
        const grade = gradeInput.value.trim();

        if (!name) {
            alert('Please enter a student name');
            return;
        }

        if (!grade) {
            alert('Please enter a grade');
            return;
        }

        try {
            // Get or create the grade group
            const groups = await DataManager.getGroups();
            let gradeGroup = groups.find(g => g.name.toLowerCase().trim() === grade.toLowerCase().trim());

            if (!gradeGroup) {
                // Create the grade group if it doesn't exist
                gradeGroup = await GroupManager.createGroup(grade);
            }

            // Add the student
            const newStudent = await DataManager.addStudent(name);

            // Assign student to the grade group
            if (newStudent && newStudent.id && gradeGroup && gradeGroup.id) {
                await GroupManager.assignStudentToGroup(newStudent.id, gradeGroup.id);
            }

            // Clear inputs
            nameInput.value = '';
            gradeInput.value = '';

            // Refresh the students list and grade dropdown
            await this.renderStudents();
            await this.populateGradeList();
        } catch (error) {
            console.error('Error adding student manually:', error);
            alert('Error adding student. Please try again.');
        }
    },

    async populateGradeList() {
        try {
            const groups = await DataManager.getGroups();
            const datalist = document.getElementById('grade-list');
            datalist.innerHTML = groups.map(group => 
                `<option value="${group.name}">`
            ).join('');
        } catch (error) {
            console.error('Error populating grade list:', error);
        }
    },

    async addStudentsBulk() {
        const input = document.getElementById('student-bulk-input');
        const names = input.value.split('\n').filter(name => name.trim());
        try {
            for (const name of names) {
                if (name.trim()) {
                    await DataManager.addStudent(name.trim());
                }
            }
            input.value = '';
            await this.renderStudents();
        } catch (error) {
            console.error('Error adding students bulk:', error);
            alert('Error adding students. Please try again.');
        }
    },

    async filterStudents(searchTerm) {
        try {
            const students = await DataManager.getStudents();
            const filtered = students.filter(s => 
                s.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
            await this.renderStudentsList(filtered);
        } catch (error) {
            console.error('Error filtering students:', error);
        }
    },

    async renderStudents() {
        try {
            const students = await DataManager.getStudents();
            document.getElementById('student-count').textContent = students.length;
            await this.renderStudentsList(students);
            await this.populateGradeList();
        } catch (error) {
            console.error('Error rendering students:', error);
        }
    },

    async renderStudentsList(students) {
        const container = document.getElementById('students-list');
        if (students.length === 0) {
            container.innerHTML = '<p class="empty-message">No students added yet.</p>';
            return;
        }

        try {
            const groups = await DataManager.getGroups();
            container.innerHTML = students.map(student => {
                const group = groups.find(g => g.id === student.group_id);
                const groupName = group ? group.name : 'Unassigned';
                return `
                    <div class="item-card">
                        <div class="item-info">
                            <strong>${student.name}</strong>
                            <span class="badge">Grade: ${groupName}</span>
                        </div>
                        <button class="btn btn-danger btn-sm" onclick="SetupView.removeStudent('${student.id}')">Remove</button>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering students list:', error);
            container.innerHTML = '<p class="empty-message">Error loading students.</p>';
        }
    },

    async removeStudent(id) {
        if (confirm('Are you sure you want to remove this student?')) {
            try {
                await DataManager.removeStudent(id);
                await this.renderStudents();
            } catch (error) {
                console.error('Error removing student:', error);
                alert('Error removing student. Please try again.');
            }
        }
    },

    // Judges
    async addJudge() {
        const name = document.getElementById('judge-name').value.trim();
        const username = document.getElementById('judge-username').value.trim();
        const password = document.getElementById('judge-password').value.trim();

        if (!name || !username || !password) {
            alert('Please fill in all fields');
            return;
        }

        try {
            await DataManager.addJudge(name, username, password);
            document.getElementById('judge-name').value = '';
            document.getElementById('judge-username').value = '';
            document.getElementById('judge-password').value = '';
            await this.renderJudges();
        } catch (error) {
            console.error('Error adding judge:', error);
            alert('Error adding judge. Please try again.');
        }
    },

    async renderJudges() {
        try {
            const judges = await DataManager.getJudges();
            document.getElementById('judge-count').textContent = judges.length;
            await this.renderJudgeAssignmentUI();
        } catch (error) {
            console.error('Error rendering judges:', error);
        }
    },

    async removeJudge(id) {
        if (confirm('Are you sure you want to remove this judge?')) {
            try {
                await DataManager.removeJudge(id);
                // Clear selection if deleted judge was selected
                if (this.selectedJudgeId === id) {
                    this.selectedJudgeId = null;
                }
                await this.renderJudges();
            } catch (error) {
                console.error('Error removing judge:', error);
                alert('Error removing judge. Please try again.');
            }
        }
    },

    // Judge Group Assignment Methods
    async renderJudgeAssignmentUI() {
        const judges = await DataManager.getJudges() || [];
        const judgesListContainer = document.getElementById('judges-list-container');
        
        // Store currently selected judge ID
        const currentSelectedJudgeId = this.selectedJudgeId || null;
        
        // Render judges list
        if (judges.length === 0) {
            judgesListContainer.innerHTML = '<p class="empty-message">No judges created yet.</p>';
        } else {
            const groups = await DataManager.getGroups() || [];
            // Fetch group counts for each judge
            const judgesWithGroupCounts = await Promise.all(judges.map(async (judge) => {
                const judgeGroupIds = await SupabaseService.getJudgeGroups(judge.id);
                const judgeGroups = groups.filter(g => judgeGroupIds.includes(g.id));
                return {
                    ...judge,
                    groupCount: judgeGroups.length
                };
            }));
            
            judgesListContainer.innerHTML = judgesWithGroupCounts.map(judge => {
                const isSelected = currentSelectedJudgeId === judge.id;
                return `
                    <div class="group-list-item ${isSelected ? 'selected' : ''}" data-judge-id="${judge.id}">
                        <div class="group-list-item-content">
                            <strong>${judge.name}</strong>
                            <span class="group-student-count">${judge.groupCount} grades</span>
                        </div>
                        <button class="btn btn-danger btn-sm delete-judge-btn" onclick="event.stopPropagation(); SetupView.removeJudge('${judge.id}')">Delete</button>
                    </div>
                `;
            }).join('');
        }
        
        // Render selected judge's groups if a judge is selected
        if (currentSelectedJudgeId) {
            await this.renderSelectedJudgeGroups(currentSelectedJudgeId);
        } else {
            document.getElementById('selected-judge-info').style.display = 'none';
            document.getElementById('no-judge-selected').style.display = 'block';
        }
        
        // Render group checkboxes for assigning
        const searchTerm = document.getElementById('judge-group-search').value || '';
        await this.renderGroupCheckboxes(currentSelectedJudgeId, searchTerm);
        
        // Update assign button state
        const assignBtn = document.getElementById('assign-groups-btn');
        assignBtn.disabled = !currentSelectedJudgeId;
    },

    async renderGroupCheckboxes(selectedJudgeId, searchTerm) {
        const groups = await DataManager.getGroups() || [];
        const students = await DataManager.getStudents() || [];
        const container = document.getElementById('group-checkbox-list');
        
        // Build student counts per group
        const studentCounts = {};
        students.forEach(student => {
            if (student.group_id) {
                studentCounts[student.group_id] = (studentCounts[student.group_id] || 0) + 1;
            }
        });
        
        // Get selected judge's group IDs from database
        const judgeGroupIds = selectedJudgeId ? await SupabaseService.getJudgeGroups(selectedJudgeId) : [];
        
        // Filter groups by search term
        const filteredGroups = groups.filter(group => 
            group.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (filteredGroups.length === 0) {
            container.innerHTML = '<p class="empty-message">No grades found.</p>';
            return;
        }
        
        // Render checkboxes
        container.innerHTML = filteredGroups.map(group => {
            const isChecked = selectedJudgeId && judgeGroupIds.includes(group.id);
            
            return `
                <div class="student-checkbox-item">
                    <label>
                        <input type="checkbox" 
                               value="${group.id}" 
                               class="group-checkbox"
                               ${isChecked ? 'checked' : ''}
                               ${!selectedJudgeId ? 'disabled' : ''}>
                        <span class="student-name">${group.name}</span>
                        <span class="badge badge-info">${studentCounts[group.id] || 0} students</span>
                    </label>
                </div>
            `;
        }).join('');
        
        // Update select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-groups');
        if (selectedJudgeId && filteredGroups.length > 0) {
            const allChecked = filteredGroups.every(g => judgeGroupIds.includes(g.id));
            const someChecked = filteredGroups.some(g => judgeGroupIds.includes(g.id));
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = someChecked && !allChecked;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    },

    updateSelectAllGroupsState() {
        const checkboxes = document.querySelectorAll('.group-checkbox:not(:disabled)');
        if (checkboxes.length === 0) return;
        
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        const selectAllCheckbox = document.getElementById('select-all-groups');
        
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = someChecked && !allChecked;
    },

    async renderSelectedJudgeGroups(judgeId) {
        const judges = await DataManager.getJudges() || [];
        const judge = judges.find(j => j.id === judgeId);
        if (!judge) return;
        
        // Fetch judge's group IDs from database
        const judgeGroupIds = await SupabaseService.getJudgeGroups(judgeId);
        const groups = await DataManager.getGroups() || [];
        const judgeGroups = groups.filter(g => judgeGroupIds.includes(g.id));
        
        const selectedJudgeInfo = document.getElementById('selected-judge-info');
        const selectedJudgeName = document.getElementById('selected-judge-name');
        const judgeGroupsList = document.getElementById('judge-groups-list');
        const noJudgeSelected = document.getElementById('no-judge-selected');
        
        selectedJudgeInfo.style.display = 'block';
        noJudgeSelected.style.display = 'none';
        selectedJudgeName.textContent = judge.name;
        
        if (judgeGroups.length === 0) {
            judgeGroupsList.innerHTML = '<p class="empty-message">No grades assigned to this judge.</p>';
        } else {
            judgeGroupsList.innerHTML = judgeGroups.map(group => `
                <div class="group-student-item">
                    <span class="student-name">${group.name}</span>
                    <button class="btn btn-danger btn-sm" onclick="SetupView.removeGroupFromJudge('${judgeId}', '${group.id}')">Remove</button>
                </div>
            `).join('');
        }
    },

    async onJudgeSelectionChange(judgeId) {
        this.selectedJudgeId = judgeId;
        const searchTerm = document.getElementById('judge-group-search').value || '';
        await this.renderGroupCheckboxes(judgeId, searchTerm);
        await this.renderSelectedJudgeGroups(judgeId);
        
        // Update assign button state
        const assignBtn = document.getElementById('assign-groups-btn');
        assignBtn.disabled = !judgeId;
        
        // Update judges list to show selected state
        const judges = await DataManager.getJudges() || [];
        const judgesListContainer = document.getElementById('judges-list-container');
        if (judges.length > 0) {
            const groups = await DataManager.getGroups() || [];
            // Fetch group counts for each judge
            const judgesWithGroupCounts = await Promise.all(judges.map(async (judge) => {
                const judgeGroupIds = await SupabaseService.getJudgeGroups(judge.id);
                const judgeGroups = groups.filter(g => judgeGroupIds.includes(g.id));
                return {
                    ...judge,
                    groupCount: judgeGroups.length
                };
            }));
            
            judgesListContainer.innerHTML = judgesWithGroupCounts.map(judge => {
                const isSelected = this.selectedJudgeId === judge.id;
                return `
                    <div class="group-list-item ${isSelected ? 'selected' : ''}" data-judge-id="${judge.id}">
                        <div class="group-list-item-content">
                            <strong>${judge.name}</strong>
                            <span class="group-student-count">${judge.groupCount} grades</span>
                        </div>
                        <button class="btn btn-danger btn-sm delete-judge-btn" onclick="event.stopPropagation(); SetupView.removeJudge('${judge.id}')">Delete</button>
                    </div>
                `;
            }).join('');
        }
    },

    async onGroupSearchChange(searchTerm) {
        await this.renderGroupCheckboxes(this.selectedJudgeId, searchTerm);
    },

    async assignSelectedGroupsToJudge(judgeId) {
        if (!judgeId) {
            alert('Please select a judge first');
            return;
        }
        
        const checkboxes = document.querySelectorAll('.group-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('Please select at least one grade');
            return;
        }
        
        const groupIds = Array.from(checkboxes).map(cb => cb.value);
        
        // Assign each selected group to the judge (add mode - adds to existing groups)
        for (const groupId of groupIds) {
            await GroupManager.assignJudgeToGroup(judgeId, groupId);
        }
        
        // Re-render the UI
        const searchTerm = document.getElementById('judge-group-search').value || '';
        await this.renderGroupCheckboxes(judgeId, searchTerm);
        await this.renderSelectedJudgeGroups(judgeId);
        await this.renderJudgeAssignmentUI();
    },

    async removeGroupFromJudge(judgeId, groupId) {
        await GroupManager.removeJudgeFromGroup(judgeId, groupId);
        // Refresh the selected judge's groups list
        if (this.selectedJudgeId === judgeId) {
            await this.renderSelectedJudgeGroups(judgeId);
        }
        // Re-render group checkboxes to update their state
        const searchTerm = document.getElementById('judge-group-search').value || '';
        await this.renderGroupCheckboxes(this.selectedJudgeId, searchTerm);
        // Re-render judges list to update group counts
        await this.renderJudgeAssignmentUI();
    },

    // Super Judges
    async addSuperJudge() {
        const name = document.getElementById('superjudge-name').value.trim();
        const username = document.getElementById('superjudge-username').value.trim();
        const password = document.getElementById('superjudge-password').value.trim();

        if (!name || !username || !password) {
            alert('Please fill in all fields');
            return;
        }

        await DataManager.addSuperJudge(name, username, password);
        document.getElementById('superjudge-name').value = '';
        document.getElementById('superjudge-username').value = '';
        document.getElementById('superjudge-password').value = '';
        await this.renderSuperJudges();
    },

    async renderSuperJudges() {
        const superJudges = await DataManager.getSuperJudges() || [];
        document.getElementById('superjudge-count').textContent = superJudges.length;
        const container = document.getElementById('superjudges-list');
        
        if (superJudges.length === 0) {
            container.innerHTML = '<p class="empty-message">No super judges added yet.</p>';
            return;
        }

        container.innerHTML = superJudges.map(superJudge => `
            <div class="item-card">
                <div class="item-info">
                    <strong>${superJudge.name}</strong>
                    <span>Username: ${superJudge.username}</span>
                </div>
                <button class="btn btn-danger btn-sm" onclick="SetupView.removeSuperJudge('${superJudge.id}')">Remove</button>
            </div>
        `).join('');
    },

    async removeSuperJudge(id) {
        if (confirm('Are you sure you want to remove this super judge?')) {
            await DataManager.removeSuperJudge(id);
            await this.renderSuperJudges();
        }
    },

    // Criteria
    async addCriterion() {
        const name = document.getElementById('criterion-name').value.trim();
        if (!name) {
            alert('Please enter a criterion name');
            return;
        }

        await DataManager.addCriterion(name);
        document.getElementById('criterion-name').value = '';
        await this.renderCriteria();
    },

    async renderCriteria() {
        const criteria = await DataManager.getCriteria() || [];
        document.getElementById('criterion-count').textContent = criteria.length;
        const container = document.getElementById('criteria-list');
        
        if (criteria.length === 0) {
            container.innerHTML = '<p class="empty-message">No criteria added yet.</p>';
            return;
        }

        container.innerHTML = criteria.map(criterion => `
            <div class="item-card">
                <div class="item-info">
                    <strong>${criterion.name}</strong>
                </div>
                <button class="btn btn-danger btn-sm" onclick="SetupView.removeCriterion('${criterion.id}')">Remove</button>
            </div>
        `).join('');
    },

    async removeCriterion(id) {
        if (confirm('Are you sure you want to remove this criterion?')) {
            await DataManager.removeCriterion(id);
            await this.renderCriteria();
        }
    },

    // Groups
    async addGroup() {
        const name = document.getElementById('group-name').value.trim();
        if (!name) {
            alert('Please enter a grade name');
            return;
        }

        await GroupManager.createGroup(name);
        document.getElementById('group-name').value = '';
        await this.renderGroups();
    },

    async renderGroups() {
        await this.renderGroupAssignmentUI();
    },

    async renderGroupAssignmentUI() {
        const groups = await DataManager.getGroups() || [];
        const groupsListContainer = document.getElementById('groups-list-container');
        
        // Sort groups in ascending order by name
        const sortedGroups = [...groups].sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        // Store currently selected group ID
        const currentSelectedGroupId = this.selectedGroupId || null;
        
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
                        <button class="btn btn-danger btn-sm delete-group-btn" onclick="event.stopPropagation(); SetupView.deleteGroup('${group.id}')">Delete</button>
                    </div>
                `;
            }).join('');
        }
        
        // Render selected group's judges if a group is selected
        if (currentSelectedGroupId) {
            await this.renderSelectedGroupJudges(currentSelectedGroupId);
        } else {
            document.getElementById('selected-group-info').style.display = 'none';
            document.getElementById('no-group-selected').style.display = 'block';
        }
        
        // Render judge checkboxes for adding
        const searchTerm = document.getElementById('group-judge-search')?.value || '';
        await this.renderJudgeCheckboxes(currentSelectedGroupId, searchTerm);
        
        // Update assign button state
        const assignBtn = document.getElementById('assign-judges-btn');
        if (assignBtn) {
            assignBtn.disabled = !currentSelectedGroupId;
        }
    },

    async renderJudgeCheckboxes(selectedGroupId, searchTerm) {
        const judges = await DataManager.getJudges() || [];
        const container = document.getElementById('judge-checkbox-list');
        
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
        const selectAllCheckbox = document.getElementById('select-all-judges');
        if (selectedGroupId && filteredJudges.length > 0) {
            const allChecked = filteredJudges.every(j => groupJudgeIds.includes(j.id));
            const someChecked = filteredJudges.some(j => groupJudgeIds.includes(j.id));
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = someChecked && !allChecked;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    },

    updateSelectAllState() {
        const checkboxes = document.querySelectorAll('.student-checkbox:not(:disabled)');
        if (checkboxes.length === 0) return;
        
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        const selectAllCheckbox = document.getElementById('select-all-students');
        
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = someChecked && !allChecked;
    },

    updateSelectAllJudgesState() {
        const checkboxes = document.querySelectorAll('.judge-checkbox:not(:disabled)');
        if (checkboxes.length === 0) return;
        
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        const selectAllCheckbox = document.getElementById('select-all-judges');
        
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = someChecked && !allChecked;
        }
    },

    async onJudgeSearchChange(searchTerm) {
        await this.renderJudgeCheckboxes(this.selectedGroupId, searchTerm);
    },

    async renderSelectedGroupJudges(groupId) {
        const groups = await DataManager.getGroups();
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        
        // Fetch judge IDs assigned to this group
        const judgeIds = await SupabaseService.getGroupJudges(groupId);
        const allJudges = await DataManager.getJudges() || [];
        const groupJudges = allJudges.filter(j => judgeIds.includes(j.id));
        
        const selectedGroupInfo = document.getElementById('selected-group-info');
        const selectedGroupName = document.getElementById('selected-group-name');
        const groupJudgesList = document.getElementById('group-judges-list');
        const noGroupSelected = document.getElementById('no-group-selected');
        
        selectedGroupInfo.style.display = 'block';
        noGroupSelected.style.display = 'none';
        selectedGroupName.textContent = group.name;
        
        if (groupJudges.length === 0) {
            groupJudgesList.innerHTML = '<p class="empty-message">No judges assigned to this grade.</p>';
        } else {
            groupJudgesList.innerHTML = groupJudges.map(judge => `
                <div class="group-student-item">
                    <span class="student-name">${judge.name}</span>
                    <button class="btn btn-danger btn-sm" onclick="SetupView.removeJudgeFromGroup('${judge.id}', '${groupId}')">Remove</button>
                </div>
            `).join('');
        }
    },

    async onGroupSelectionChange(groupId) {
        this.selectedGroupId = groupId;
        const searchTerm = document.getElementById('group-judge-search')?.value || '';
        await this.renderJudgeCheckboxes(groupId, searchTerm);
        await this.renderSelectedGroupJudges(groupId);
        
        // Update assign button state
        const assignBtn = document.getElementById('assign-judges-btn');
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
        
        const groupsListContainer = document.getElementById('groups-list-container');
        if (groupsWithJudgeCounts.length > 0) {
            groupsListContainer.innerHTML = groupsWithJudgeCounts.map(group => {
                const isSelected = this.selectedGroupId === group.id;
                return `
                    <div class="group-list-item ${isSelected ? 'selected' : ''}" data-group-id="${group.id}">
                        <div class="group-list-item-content">
                            <strong>${group.name}</strong>
                            <span class="group-student-count">${group.judgeCount} judges</span>
                        </div>
                        <button class="btn btn-danger btn-sm delete-group-btn" onclick="event.stopPropagation(); SetupView.deleteGroup('${group.id}')">Delete</button>
                    </div>
                `;
            }).join('');
        }
    },

    async onStudentSearchChange(searchTerm) {
        await this.renderStudentCheckboxes(this.selectedGroupId, searchTerm);
    },

    async assignSelectedJudgesToGroup(groupId) {
        if (!groupId) {
            alert('Please select a grade first');
            return;
        }
        
        const checkboxes = document.querySelectorAll('.judge-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('Please select at least one judge');
            return;
        }
        
        const judgeIds = Array.from(checkboxes).map(cb => cb.value);
        
        // Assign each selected judge to the group
        for (const judgeId of judgeIds) {
            await GroupManager.assignJudgeToGroup(judgeId, groupId);
        }
        
        // Re-render the UI
        const searchTerm = document.getElementById('group-judge-search')?.value || '';
        await this.renderJudgeCheckboxes(groupId, searchTerm);
        await this.renderSelectedGroupJudges(groupId);
        await this.renderGroupAssignmentUI();
    },

    async updateGroupJudges(groupId) {
        const select = document.getElementById(`judge-select-${groupId}`);
        const selectedJudges = Array.from(select.selectedOptions).map(opt => opt.value);
        const groups = await DataManager.getGroups();
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        const allJudges = await DataManager.getJudges() || [];
        
        // Remove judges not selected
        for (const judgeId of group.judgeIds) {
            if (!selectedJudges.includes(judgeId)) {
                await GroupManager.removeJudgeFromGroup(judgeId, groupId);
            }
        }

        // Add newly selected judges
        for (const judgeId of selectedJudges) {
            if (!group.judgeIds.includes(judgeId)) {
                await GroupManager.assignJudgeToGroup(judgeId, groupId);
            }
        }

        await this.renderGroups();
    },

    async addStudentToGroup(groupId) {
        const select = document.getElementById(`student-select-${groupId}`);
        const studentId = select.value;
        if (!studentId) {
            alert('Please select a student');
            return;
        }

        await GroupManager.assignStudentToGroup(studentId, groupId);
        select.value = '';
        await this.renderGroups();
    },

    async removeStudentFromGroup(studentId, groupId) {
        await GroupManager.removeStudentFromGroup(studentId);
        // Refresh the selected group's students list
        if (this.selectedGroupId === groupId) {
            await this.renderSelectedGroupStudents(groupId);
        }
        // Re-render student checkboxes to update their state
        const searchTerm = document.getElementById('group-student-search')?.value || '';
        await this.renderStudentCheckboxes(this.selectedGroupId, searchTerm);
        // Re-render groups list to update student counts
        await this.renderGroupAssignmentUI();
    },

    async removeJudgeFromGroup(judgeId, groupId) {
        await GroupManager.removeJudgeFromGroup(judgeId, groupId);
        // Refresh the selected group's judges list
        if (this.selectedGroupId === groupId) {
            await this.renderSelectedGroupJudges(groupId);
        }
        // Re-render judge checkboxes to update their state
        const searchTerm = document.getElementById('group-judge-search')?.value || '';
        await this.renderJudgeCheckboxes(this.selectedGroupId, searchTerm);
        // Re-render groups list to update judge counts
        await this.renderGroupAssignmentUI();
    },

    async deleteGroup(id) {
        if (confirm('Are you sure you want to delete this grade? All student assignments will be removed.')) {
            await GroupManager.deleteGroup(id);
            // Clear selection if deleted group was selected
            if (this.selectedGroupId === id) {
                this.selectedGroupId = null;
            }
            await this.renderGroups();
        }
    },

    // Import/Export
    importConfig() {
        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const success = DataManager.importConfig(e.target.result);
            if (success) {
                alert('Configuration imported successfully!');
                this.render();
            } else {
                alert('Error importing configuration. Please check the file format.');
            }
        };
        reader.readAsText(file);
    },

    /**
     * Import students from Excel spreadsheet
     * Expects columns: "Students Name" and "Grade"
     */
    importStudentsFromSpreadsheet() {
        const fileInput = document.getElementById('import-spreadsheet-file');
        const file = fileInput.files[0];
        const statusDiv = document.getElementById('import-spreadsheet-status');
        
        if (!file) {
            this.showImportStatus('Please select an Excel file (.xlsx)', 'error');
            return;
        }

        // Validate file extension
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            this.showImportStatus('Invalid file format. Please select an Excel file (.xlsx)', 'error');
            return;
        }

        // Check if XLSX library is available
        if (typeof XLSX === 'undefined') {
            this.showImportStatus('Excel library not loaded. Please refresh the page.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                if (!worksheet) {
                    this.showImportStatus('Spreadsheet is empty or invalid.', 'error');
                    return;
                }

                // Convert to JSON array
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                
                if (jsonData.length === 0) {
                    this.showImportStatus('Spreadsheet is empty.', 'error');
                    return;
                }

                // Find header row (first non-empty row)
                let headerRowIndex = -1;
                for (let i = 0; i < jsonData.length; i++) {
                    if (jsonData[i].some(cell => cell && cell.toString().trim())) {
                        headerRowIndex = i;
                        break;
                    }
                }

                if (headerRowIndex === -1) {
                    this.showImportStatus('Could not find header row in spreadsheet.', 'error');
                    return;
                }

                const headers = jsonData[headerRowIndex].map(h => h ? h.toString().trim() : '');
                
                // Find column indices
                const studentNameColIndex = this.findColumnIndex(headers, 'Students Name');
                const gradeColIndex = this.findColumnIndex(headers, 'Grade');

                if (studentNameColIndex === -1) {
                    this.showImportStatus('Could not find "Students Name" column. Please check your spreadsheet headers.', 'error');
                    return;
                }

                if (gradeColIndex === -1) {
                    this.showImportStatus('Could not find "Grade" column. Please check your spreadsheet headers.', 'error');
                    return;
                }

                // Extract student data
                const studentData = [];
                for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    const studentName = row[studentNameColIndex] ? row[studentNameColIndex].toString().trim() : '';
                    const grade = row[gradeColIndex] ? row[gradeColIndex].toString().trim() : '';
                    
                    // Skip empty rows
                    if (!studentName && !grade) continue;
                    
                    // Skip rows with missing student name
                    if (!studentName) continue;
                    
                    // Skip rows with missing grade
                    if (!grade) continue;
                    
                    studentData.push({ name: studentName, grade: grade });
                }

                if (studentData.length === 0) {
                    this.showImportStatus('No valid student data found in spreadsheet.', 'error');
                    return;
                }

                // Process import
                const result = await this.processSpreadsheetImport(studentData);
                
                // Show success message
                this.showImportStatus(
                    `Import successful! Created ${result.groupsCreated} grade(s) and imported ${result.studentsCreated} student(s).`,
                    'success'
                );
                
                // Clear file input
                fileInput.value = '';
                
                // Refresh UI
                await this.render();
                
            } catch (error) {
                console.error('Import error:', error);
                this.showImportStatus(`Error importing spreadsheet: ${error.message}`, 'error');
            }
        };
        
        reader.onerror = () => {
            this.showImportStatus('Error reading file. Please try again.', 'error');
        };
        
        reader.readAsArrayBuffer(file);
    },

    /**
     * Find column index by flexible name matching (case-insensitive)
     */
    findColumnIndex(headers, columnName) {
        const normalizedName = columnName.toLowerCase().trim();
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim();
            if (header === normalizedName || header.includes(normalizedName) || normalizedName.includes(header)) {
                return i;
            }
        }
        return -1;
    },

    /**
     * Generate unique name by adding suffix if name already exists
     */
    generateUniqueName(baseName, existingNames) {
        if (!existingNames.includes(baseName)) {
            return baseName;
        }
        
        let counter = 2;
        let newName = `${baseName} (${counter})`;
        while (existingNames.includes(newName)) {
            counter++;
            newName = `${baseName} (${counter})`;
        }
        return newName;
    },

    /**
     * Process spreadsheet import: create groups and students
     */
    async processSpreadsheetImport(studentData) {
        const groups = await DataManager.getGroups() || [];
        const students = await DataManager.getStudents() || [];
        
        const existingGroupNames = groups.map(g => g.name);
        const existingStudentNames = students.map(s => s.name);
        
        const groupsCreated = new Set();
        const studentsCreated = [];
        const gradeToGroupIdMap = {};
        
        // Group students by grade (normalize grade values)
        const studentsByGrade = {};
        studentData.forEach(item => {
            const normalizedGrade = item.grade ? item.grade.toString().trim() : '';
            if (!normalizedGrade) {
                console.warn(`Skipping student "${item.name}" with empty grade`);
                return;
            }
            if (!studentsByGrade[normalizedGrade]) {
                studentsByGrade[normalizedGrade] = [];
            }
            studentsByGrade[normalizedGrade].push(item.name);
        });
        
        console.log(`Found ${Object.keys(studentsByGrade).length} unique grades:`, Object.keys(studentsByGrade));
        
        // Create groups for each grade
        for (const grade of Object.keys(studentsByGrade)) {
            let groupName = grade.trim();
            
            // Skip empty grade names
            if (!groupName) {
                console.warn('Skipping empty grade name');
                continue;
            }
            
            // Check if group with this name exists, create new with suffix if needed
            if (existingGroupNames.includes(groupName)) {
                groupName = this.generateUniqueName(groupName, existingGroupNames);
            }
            
            try {
                // Create group
                const newGroup = await GroupManager.createGroup(groupName);
                if (newGroup && newGroup.id) {
                    gradeToGroupIdMap[grade] = newGroup.id;
                    groupsCreated.add(newGroup.id);
                    existingGroupNames.push(groupName);
                    console.log(`Created group: ${groupName} (ID: ${newGroup.id})`);
                } else {
                    console.error(`Failed to create group: ${groupName} - no ID returned`);
                }
            } catch (error) {
                console.error(`Error creating group "${groupName}":`, error);
                // If group creation fails, try to find existing group with this name
                const existingGroups = await DataManager.getGroups();
                const existingGroup = existingGroups.find(g => g.name === groupName);
                if (existingGroup) {
                    gradeToGroupIdMap[grade] = existingGroup.id;
                    console.log(`Using existing group: ${groupName} (ID: ${existingGroup.id})`);
                } else {
                    // If we can't create or find the group, skip this grade
                    console.error(`Cannot create or find group for grade: ${grade}`);
                }
            }
        }
        
        // Refresh groups cache after creating all groups
        await DataManager.refreshCache();
        
        // Verify all groups exist before assigning students
        const allGroups = await DataManager.getGroups();
        console.log(`Total groups after creation: ${allGroups.length}`);
        console.log(`Groups created in this import: ${groupsCreated.size}`);
        console.log(`Grade to Group ID mapping:`, gradeToGroupIdMap);
        
        // Create students and assign to groups
        for (const item of studentData) {
            let studentName = item.name ? item.name.toString().trim() : '';
            const normalizedGrade = item.grade ? item.grade.toString().trim() : '';
            
            // Skip if student name is empty
            if (!studentName) {
                console.warn('Skipping student with empty name');
                continue;
            }
            
            // Skip if grade is empty
            if (!normalizedGrade) {
                console.warn(`Skipping student "${studentName}" with empty grade`);
                continue;
            }
            
            // Check if student with this name exists, create new with suffix if needed
            if (existingStudentNames.includes(studentName)) {
                studentName = this.generateUniqueName(studentName, existingStudentNames);
            }
            
            try {
                // Create student
                const newStudent = await DataManager.addStudent(studentName);
                if (newStudent && newStudent.id) {
                    studentsCreated.push(newStudent.id);
                    existingStudentNames.push(studentName);
                    
                    // Assign to group using normalized grade
                    const groupId = gradeToGroupIdMap[normalizedGrade];
                    if (groupId) {
                        try {
                            await GroupManager.assignStudentToGroup(newStudent.id, groupId);
                            console.log(`Assigned student "${studentName}" (grade: ${normalizedGrade}) to group ID: ${groupId}`);
                        } catch (assignError) {
                            console.error(`Error assigning student "${studentName}" to group ${groupId}:`, assignError);
                        }
                    } else {
                        console.warn(`No group ID found for grade "${normalizedGrade}" - student "${studentName}" will be unassigned`);
                    }
                } else {
                    console.error(`Failed to create student: ${studentName} - no ID returned`);
                }
            } catch (error) {
                console.error(`Error creating student "${studentName}":`, error);
            }
        }
        
        return {
            groupsCreated: groupsCreated.size,
            studentsCreated: studentsCreated.length
        };
    },

    /**
     * Show import status message
     */
    showImportStatus(message, type) {
        const statusDiv = document.getElementById('import-spreadsheet-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `import-status ${type}`;
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    },

    /**
     * Show judge import status message
     */
    showJudgeImportStatus(message, type) {
        const statusDiv = document.getElementById('import-judges-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `import-status ${type}`;
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    },

    /**
     * Import judges from Excel spreadsheet
     * Expects columns: "Judge Name", "username", "password", "Assigned group"
     */
    async importJudgesFromSpreadsheet() {
        const fileInput = document.getElementById('import-judges-file');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showJudgeImportStatus('Please select an Excel file (.xlsx)', 'error');
            return;
        }

        // Validate file extension
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            this.showJudgeImportStatus('Invalid file format. Please select an Excel file (.xlsx)', 'error');
            return;
        }

        // Check if XLSX library is available
        if (typeof XLSX === 'undefined') {
            this.showJudgeImportStatus('Excel library not loaded. Please refresh the page.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                if (!worksheet) {
                    this.showJudgeImportStatus('Spreadsheet is empty or invalid.', 'error');
                    return;
                }

                // Convert to JSON array
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                
                if (jsonData.length === 0) {
                    this.showJudgeImportStatus('Spreadsheet is empty.', 'error');
                    return;
                }

                // Find header row (first non-empty row)
                let headerRowIndex = -1;
                for (let i = 0; i < jsonData.length; i++) {
                    if (jsonData[i].some(cell => cell && cell.toString().trim())) {
                        headerRowIndex = i;
                        break;
                    }
                }

                if (headerRowIndex === -1) {
                    this.showJudgeImportStatus('Could not find header row in spreadsheet.', 'error');
                    return;
                }

                const headers = jsonData[headerRowIndex].map(h => h ? h.toString().trim() : '');
                
                // Find column indices
                const judgeNameColIndex = this.findColumnIndex(headers, 'Judge Name');
                const usernameColIndex = this.findColumnIndex(headers, 'username');
                const passwordColIndex = this.findColumnIndex(headers, 'password');
                const assignedGroupColIndex = this.findColumnIndex(headers, 'Assigned group');

                if (judgeNameColIndex === -1) {
                    this.showJudgeImportStatus('Could not find "Judge Name" column. Please check your spreadsheet headers.', 'error');
                    return;
                }

                if (usernameColIndex === -1) {
                    this.showJudgeImportStatus('Could not find "username" column. Please check your spreadsheet headers.', 'error');
                    return;
                }

                if (passwordColIndex === -1) {
                    this.showJudgeImportStatus('Could not find "password" column. Please check your spreadsheet headers.', 'error');
                    return;
                }

                if (assignedGroupColIndex === -1) {
                    this.showJudgeImportStatus('Could not find "Assigned group" column. Please check your spreadsheet headers.', 'error');
                    return;
                }

                // Extract judge data
                const judgeData = [];
                for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    const judgeName = row[judgeNameColIndex] ? row[judgeNameColIndex].toString().trim() : '';
                    const username = row[usernameColIndex] ? row[usernameColIndex].toString().trim() : '';
                    const password = row[passwordColIndex] ? row[passwordColIndex].toString().trim() : '';
                    const assignedGroup = row[assignedGroupColIndex] ? row[assignedGroupColIndex].toString().trim() : '';
                    
                    // Skip empty rows
                    if (!judgeName && !username && !password && !assignedGroup) continue;
                    
                    // Skip rows with missing required fields
                    if (!judgeName || !username || !password || !assignedGroup) {
                        console.warn(`Skipping row ${i + 1}: missing required fields`);
                        continue;
                    }
                    
                    judgeData.push({ 
                        name: judgeName, 
                        username: username, 
                        password: password, 
                        assignedGroup: assignedGroup 
                    });
                }

                if (judgeData.length === 0) {
                    this.showJudgeImportStatus('No valid judge data found in spreadsheet.', 'error');
                    return;
                }

                // Validate all groups exist before processing (fail fast)
                const validationResult = await this.validateGroupsExist(judgeData);
                if (!validationResult.valid) {
                    this.showJudgeImportStatus(`Import failed: ${validationResult.missingGroups.join(', ')} grade(s) do not exist. Please create these grades first.`, 'error');
                    return;
                }

                // Process import
                const result = await this.processJudgeImport(judgeData);
                
                // Show success message
                let message = `Import successful! `;
                if (result.judgesCreated > 0) {
                    message += `Created ${result.judgesCreated} judge(s). `;
                }
                if (result.judgesUpdated > 0) {
                    message += `Updated ${result.judgesUpdated} judge(s). `;
                }
                if (result.errors.length > 0) {
                    message += `Encountered ${result.errors.length} error(s). `;
                }
                this.showJudgeImportStatus(message.trim(), result.errors.length > 0 ? 'error' : 'success');
                
                // Clear file input
                fileInput.value = '';
                
                // Refresh UI
                await this.renderJudges();
                
            } catch (error) {
                console.error('Import error:', error);
                this.showJudgeImportStatus(`Error importing spreadsheet: ${error.message}`, 'error');
            }
        };
        
        reader.onerror = () => {
            this.showJudgeImportStatus('Error reading file. Please try again.', 'error');
        };
        
        reader.readAsArrayBuffer(file);
    },

    /**
     * Validate that all groups referenced in judge data exist
     * @param {Array} judgeData - Array of judge objects with assignedGroup property
     * @returns {Promise<{valid: boolean, missingGroups: Array}>}
     */
    async validateGroupsExist(judgeData) {
        try {
            const groups = await DataManager.getGroups() || [];
            const existingGroupNames = groups.map(g => g.name.toLowerCase().trim());
            
            // Get unique group names from judge data
            const requiredGroupNames = [...new Set(judgeData.map(j => j.assignedGroup.toLowerCase().trim()))];
            
            const missingGroups = [];
            for (const groupName of requiredGroupNames) {
                if (!existingGroupNames.includes(groupName)) {
                    // Find original case from judge data
                    const originalName = judgeData.find(j => j.assignedGroup.toLowerCase().trim() === groupName)?.assignedGroup;
                    missingGroups.push(originalName || groupName);
                }
            }
            
            return {
                valid: missingGroups.length === 0,
                missingGroups: missingGroups
            };
        } catch (error) {
            console.error('Error validating groups:', error);
            throw error;
        }
    },

    /**
     * Process judge import: create/update judges and assign to groups
     * @param {Array} judgeData - Array of judge objects
     * @returns {Promise<{judgesCreated: number, judgesUpdated: number, errors: Array}>}
     */
    async processJudgeImport(judgeData) {
        const groups = await DataManager.getGroups() || [];
        const judges = await DataManager.getJudges() || [];
        
        // Create group name to ID mapping
        const groupNameToIdMap = {};
        groups.forEach(group => {
            groupNameToIdMap[group.name.toLowerCase().trim()] = group.id;
        });
        
        const judgesCreated = [];
        const judgesUpdated = [];
        const errors = [];
        
        for (const judgeInfo of judgeData) {
            try {
                const { name, username, password, assignedGroup } = judgeInfo;
                
                // Find group ID
                const normalizedGroupName = assignedGroup.toLowerCase().trim();
                const groupId = groupNameToIdMap[normalizedGroupName];
                
                if (!groupId) {
                    errors.push(`Group "${assignedGroup}" not found for judge "${name}"`);
                    continue;
                }
                
                // Check if judge exists
                const existingJudge = await SupabaseService.getJudgeByUsername(username);
                
                if (existingJudge) {
                    // Update existing judge
                    const passwordHash = await PasswordUtils.hashPassword(password);
                    await SupabaseService.updateJudge(existingJudge.id, name, username, passwordHash);
                    
                    // Remove old group assignments
                    const oldGroupIds = await SupabaseService.getJudgeGroups(existingJudge.id);
                    for (const oldGroupId of oldGroupIds) {
                        await SupabaseService.removeJudgeFromGroup(existingJudge.id, oldGroupId);
                    }
                    
                    // Assign to new group
                    await SupabaseService.assignJudgeToGroup(existingJudge.id, groupId);
                    
                    judgesUpdated.push(existingJudge.id);
                } else {
                    // Create new judge
                    const passwordHash = await PasswordUtils.hashPassword(password);
                    const newJudge = await SupabaseService.addJudge(name, username, passwordHash);
                    
                    // Assign to group
                    await SupabaseService.assignJudgeToGroup(newJudge.id, groupId);
                    
                    judgesCreated.push(newJudge.id);
                }
            } catch (error) {
                console.error(`Error processing judge "${judgeInfo.name}":`, error);
                errors.push(`Error processing judge "${judgeInfo.name}": ${error.message}`);
            }
        }
        
        // Refresh cache after all operations
        await DataManager.refreshCache();
        
        return {
            judgesCreated: judgesCreated.length,
            judgesUpdated: judgesUpdated.length,
            errors: errors
        };
    }
};

