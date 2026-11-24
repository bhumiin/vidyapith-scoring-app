/**
 * Judge View Module
 * Handles the judge scoring interface
 */

const JudgeView = {
    currentStudentId: null,
    currentSubmitted: false,
    currentScores: {},
    currentNotes: '',
    selectedGradeId: null,
    _listenersInitialized: false,
    // what the database holds for the open student, so a draft save only writes
    // what actually changed
    savedScores: {},
    savedNotes: '',
    // the class list: rows from the database, plus the view's own filter state
    _classRows: [],
    _classQuery: '',
    _classFilter: 'all',

    async init() {
        this.setupEventListeners();
        await this.render();
    },

    setupEventListeners() {
        if (this._listenersInitialized) {
            return;
        }
        // The class list is the picker: one row per student, click to open.
        const classList = document.getElementById('scored-students-list');
        if (classList) {
            classList.addEventListener('click', (e) => {
                const row = e.target.closest('[data-student-id]');
                if (!row) return;
                this.switchStudent(row.dataset.studentId).catch(error => {
                    console.error('Error switching student:', error);
                });
            });
        }

        const search = document.getElementById('class-search');
        if (search) {
            search.addEventListener('input', (e) => {
                this._classQuery = e.target.value.toLowerCase().trim();
                this.drawClassList();
            });
        }

        const filters = document.getElementById('class-filters');
        if (filters) {
            filters.addEventListener('click', (e) => {
                const button = e.target.closest('[data-filter]');
                if (!button) return;
                this._classFilter = button.dataset.filter;
                filters.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('on', b === button));
                this.drawClassList();
            });
        }

        const nextOpen = document.getElementById('next-open');
        if (nextOpen) {
            nextOpen.addEventListener('click', () => {
                this.nextOpenStudent().catch(error => {
                    console.error('Error moving to the next student:', error);
                });
            });
        }

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
            // id -> name, used by the confirmation prompt when picking a grade
            this.gradeNames = {};
            judgeGroups.forEach(g => { this.gradeNames[g.id] = g.name; });
            const groupsInfoElement = document.getElementById('judge-groups-info');
            const topicsContainerElement = document.getElementById('judge-topics-info');
            
            // Reset selected grade
            this.selectedGradeId = null;
            this.judgeGradeCount = judgeGroups.length;

            if (judgeGroups.length === 0) {
                groupsInfoElement.innerHTML = '<span class="grade-capsule">No grades assigned</span>';
                if (topicsContainerElement) {
                    topicsContainerElement.innerHTML = '';
                }
                this.updateContentVisibility(false);
            } else if (judgeGroups.length === 1) {
                // Single grade: auto-select and show topics directly
                this.selectedGradeId = judgeGroups[0].id;

                groupsInfoElement.innerHTML = judgeGroups.map(g =>
                    `<span class="grade-capsule selected" data-group-id="${g.id}">Grade ${g.name}</span>`
                ).join('');

                const topics = await DataManager.getTopicsByGroup(judgeGroups[0].id);
                await this.renderTopics(topics, judgeGroups[0].id);
                this.updateContentVisibility(true);
            } else {
                // Several grades: only the grade pills until one is chosen
                groupsInfoElement.innerHTML = judgeGroups.map(g =>
                    `<span class="grade-capsule clickable" data-group-id="${g.id}">Grade ${g.name}</span>`
                ).join('');

                if (topicsContainerElement) {
                    topicsContainerElement.innerHTML =
                        '<p class="topic-message">Select a grade above to see its topics and students</p>';
                }
                this.updateContentVisibility(false);
            }

            // The class list is the only picker now
            await this.renderClassList();
            await this.updateSubmitAllButtonState();
        } catch (error) {
            console.error('Error rendering judge view:', error);
            UI.toast('Error loading judge view. Please refresh the page.', { type: 'error' });
            // Still update button state on error
            await this.updateSubmitAllButtonState();
        }
    },

    /**
     * The student selector, scoring area and scored list mean nothing until a
     * grade is chosen, so they stay hidden for a judge who covers several grades.
     */
    updateContentVisibility(show) {
        const content = document.querySelector('.judge-content');
        if (content) {
            content.style.display = show ? '' : 'none';
        }
    },

    /**
     * The class list: every student in the open grade, with what is already
     * saved. Two bulk reads (scores and submissions) instead of one query per
     * student — at eighteen names the per-student version was 126 round trips.
     */
    async renderClassList() {
        const container = document.getElementById('scored-students-list');
        if (!container) return;

        const user = await AuthManager.getCurrentUser();
        if (!user) return;

        if (!this.selectedGradeId) {
            this._classRows = [];
            this.drawClassList();
            return;
        }

        try {
            const [studentsAll, criteria, scores, submissions] = await Promise.all([
                GroupManager.getStudentsForJudge(user.id),
                DataManager.getCriteria(),
                DataManager.getScores(),
                DataManager.getSubmissions()
            ]);

            const students = studentsAll.filter(s => s.group_id === this.selectedGradeId);

            this._classRows = students.map(student => {
                const byJudge = (scores[student.id] && scores[student.id][user.id]) || {};
                const hasScore = value => value !== null && value !== undefined && value !== '';
                const scoredCount = criteria.filter(c => hasScore(byJudge[c.id])).length;
                const required = criteria.filter(c => !DataManager.isPenaltyCriterion(c));
                const complete = required.length > 0 && required.every(c => hasScore(byJudge[c.id]));
                const submitted = (submissions[student.id] || []).includes(user.id);
                const total = DataManager.totalForJudge(criteria, c => hasScore(byJudge[c.id]) ? byJudge[c.id] : null);
                return {
                    id: student.id,
                    name: student.name,
                    total: total,
                    complete: complete,
                    scored: scoredCount,
                    required: required.length,
                    status: submitted ? 'submitted' : scoredCount > 0 ? 'draft' : 'todo'
                };
            });

            this.drawClassList();
        } catch (error) {
            console.error('Error loading the class list:', error);
            container.innerHTML = '<p class="class-empty">Could not load the class list.</p>';
        }
    },

    /** Filter, sort and paint the rows already in memory. */
    drawClassList() {
        const container = document.getElementById('scored-students-list');
        if (!container) return;

        const query = this._classQuery || '';
        const filter = this._classFilter || 'all';
        const all = this._classRows || [];

        const rows = all.filter(row =>
            (filter === 'all' || row.status === filter) &&
            row.name.toLowerCase().includes(query));

        if (!this.selectedGradeId) {
            container.innerHTML = '<p class="class-empty">Pick a grade above.</p>';
        } else if (!all.length) {
            container.innerHTML = '<p class="class-empty">No students in this grade yet.</p>';
        } else if (!rows.length) {
            container.innerHTML = '<p class="class-empty">No student matches.</p>';
        } else {
            const initials = name => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
            const label = status => status === 'submitted' ? 'Submitted' : status === 'draft' ? 'Draft' : 'Not started';
            container.innerHTML = rows.map(row => `
                <button type="button" class="class-row ${row.id === this.currentStudentId ? 'on' : ''}"
                        data-student-id="${row.id}">
                    <span class="class-row__av">${initials(row.name)}</span>
                    <span class="class-row__txt">
                        <span class="class-row__name">${row.name}</span>
                        <span class="class-row__status ${row.status}">${label(row.status)}</span>
                    </span>
                    <span class="class-row__total">${row.status === 'todo' ? '—' : row.total + '<small>/40</small>'}</span>
                </button>
            `).join('');
        }

        // counts + progress on the panel
        const submitted = all.filter(r => r.status === 'submitted').length;
        const draft = all.filter(r => r.status === 'draft').length;
        const todo = all.filter(r => r.status === 'todo').length;
        const countEl = document.getElementById('class-count');
        if (countEl) countEl.textContent = all.length ? `${submitted} of ${all.length} submitted` : '—';

        const labelEl = document.getElementById('class-progress-label');
        if (labelEl) labelEl.textContent = all.length
            ? `${submitted} submitted · ${draft} draft · ${todo} not started`
            : '';

        const bar = document.getElementById('class-progress-bar');
        if (bar) bar.style.width = all.length ? Math.round((submitted / all.length) * 100) + '%' : '0%';

        const nextOpen = document.getElementById('next-open');
        if (nextOpen) {
            const nothingLeft = all.length > 0 && all.every(r => r.status === 'submitted');
            nextOpen.disabled = nothingLeft || all.length === 0;
            nextOpen.classList.toggle('btn-disabled', nextOpen.disabled);
            nextOpen.title = nothingLeft
                ? 'Every student in this grade is submitted'
                : 'Open the next student who is not submitted yet';
        }
    },

    /** Open a student, saving the open one first if anything changed. */
    async switchStudent(studentId) {
        if (!studentId || studentId === this.currentStudentId) return;

        try {
            await this.persistDraft();
        } catch (error) {
            console.error('Error saving the draft:', error);
            UI.toast('Could not save the current student. Staying here so nothing is lost.', { type: 'error' });
            return;
        }

        await this.selectStudent(studentId);
        await this.renderClassList();
    },

    /** Move to the next student who is not saved yet, in list order. */
    async nextOpenStudent() {
        const open = (this._classRows || []).filter(r => r.status !== 'saved');
        if (!open.length) {
            UI.toast('Every student in this grade is already submitted.', { type: 'success' });
            return;
        }
        const index = open.findIndex(r => r.id === this.currentStudentId);
        const next = open[index + 1] || open[0];
        await this.switchStudent(next.id);
        const row = document.querySelector(`.class-row[data-student-id="${next.id}"]`);
        if (row) row.scrollIntoView({ block: 'nearest' });
    },

    /**
     * Write what is on screen for the open student, without asking and without
     * submitting. Only differences are written: a cleared value removes its row
     * (008_judge_clears_own_scores.sql is what lets a judge do that).
     * @returns {Promise<number>} number of writes made
     */
    async persistDraft() {
        const studentId = this.currentStudentId;
        if (!studentId) return 0;

        const user = await AuthManager.getCurrentUser();
        if (!user) return 0;

        const submitted = await DataManager.isSubmitted(studentId, user.id);
        if (submitted) {
            // Scores are final once submitted; the note is still the judge's own
            const notesEl = document.getElementById('judge-notes-input');
            const nextNotes = notesEl ? notesEl.value : this.currentNotes;
            if (nextNotes !== (this.savedNotes || '')) {
                await SupabaseService.setNote(studentId, user.id, nextNotes || '');
                this.savedNotes = nextNotes || '';
                return 1;
            }
            return 0;
        }

        const criteria = this.currentCriteria || [];
        const normalise = value => (value === '' || value === null || value === undefined) ? null : Number(value);
        const writes = [];

        for (const criterion of criteria) {
            const next = normalise(this.currentScores[criterion.id]);
            const before = normalise(this.savedScores[criterion.id]);
            if (next === before) continue;

            if (next === null) {
                writes.push(SupabaseService.deleteScore(studentId, user.id, criterion.id));
            } else {
                writes.push(SupabaseService.setScore(studentId, user.id, criterion.id, next));
            }
        }

        const notesEl = document.getElementById('judge-notes-input');
        const nextNotes = notesEl ? notesEl.value : this.currentNotes;
        if (nextNotes !== (this.savedNotes || '')) {
            writes.push(SupabaseService.setNote(studentId, user.id, nextNotes || ''));
        }

        if (!writes.length) return 0;

        await Promise.all(writes);
        await DataManager.refreshCache();

        // what the database now holds is what is on screen
        this.savedScores = Object.assign({}, this.currentScores);
        this.savedNotes = nextNotes || '';
        return writes.length;
    },

    /**
     * A submitted student is final: the database refuses writes anyway, so the
     * chips must not pretend otherwise.
     */
    lockChips(locked) {
        document.querySelectorAll('.score-chip').forEach(chip => {
            chip.disabled = !!locked;
        });
        const saveBtn = document.getElementById('save-scores');
        if (saveBtn && locked) {
            saveBtn.disabled = true;
            saveBtn.classList.add('btn-disabled');
            saveBtn.title = 'This student is submitted — scores are locked';
        }
    },

    clearStudent() {
        this.currentStudentId = null;
        this.currentSubmitted = false;
        this.currentScores = {};
        this.savedScores = {};
        this.currentNotes = '';
        this.savedNotes = '';
        document.getElementById('judge-scoring-section').style.display = 'none';
        document.getElementById('judge-no-student').style.display = '';
    },

    async selectGrade(groupId) {
        // Confirm before choosing/switching: scores entered against the wrong
        // grade are the kind of mistake that only shows up at submission time.
        if (groupId !== this.selectedGradeId) {
            const next = (this.gradeNames && this.gradeNames[groupId]) || 'this grade';
            const prev = this.selectedGradeId && this.gradeNames
                ? this.gradeNames[this.selectedGradeId]
                : null;
            const question = prev
                ? `Switch from Grade ${prev} to Grade ${next}?`
                : `Enter scores for Grade ${next}?`;
            const confirmed = await UI.modal.confirm({
                title: question,
                message: `Only students from Grade ${next} will be listed.`,
                confirmLabel: prev ? 'Switch grade' : 'Enter scores',
                cancelLabel: 'Cancel'
            });
            if (!confirmed) {
                return;   // keep whatever was selected before
            }
        }

        // Set selected grade first
        this.selectedGradeId = groupId;
        this.updateContentVisibility(true);
        
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
        
        // Clear the open student if they belong to the grade we just left
        if (this.currentStudentId) {
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === this.currentStudentId);
            if (student && student.group_id !== groupId) {
                await this.persistDraft().catch(error => console.error('Draft on grade switch:', error));
                this.clearStudent();
            }
        }
        
        // Fetch and display topics for selected grade
        const topics = await DataManager.getTopicsByGroup(groupId);
        await this.renderTopics(topics, groupId);
        
        // Redraw the class list for the grade we just opened
        await this.renderClassList();
        await this.updateSubmitAllButtonState();
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
                <h3 class="topics-title">${topics.length === 1 ? 'Topic:' : 'Topics:'}</h3>
                <ul class="topics-list">${topicsList}</ul>
            </div>
        `;
    },

    async selectStudent(studentId) {
        if (!studentId) {
            this.clearStudent();
            return;
        }

        try {
            this.currentStudentId = studentId;
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === studentId);
            const criteria = await DataManager.getCriteria();
            const user = await AuthManager.getCurrentUser();

            this.currentSubmitted = await DataManager.isSubmitted(studentId, user.id);

            document.getElementById('current-student-name').textContent = student.name;
            // flex, not block: the card is a column with a scrolling middle and a pinned footer
            document.getElementById('judge-scoring-section').style.display = 'flex';
            document.getElementById('judge-no-student').style.display = 'none';
            const lockBadge = document.getElementById('student-lock');
            if (lockBadge) lockBadge.hidden = !this.currentSubmitted;

            // Load existing scores
            this.currentScores = {};
            for (const criterion of criteria) {
                const score = await DataManager.getScore(studentId, user.id, criterion.id);
                this.currentScores[criterion.id] = score || '';
            }

            // Load existing notes
            const existingNotes = await DataManager.getNote(studentId, user.id);
            this.currentNotes = existingNotes || '';
            this.savedScores = Object.assign({}, this.currentScores);
            this.savedNotes = this.currentNotes;
            const notesTextarea = document.getElementById('judge-notes-input');
            if (notesTextarea) {
                notesTextarea.value = this.currentNotes;
                notesTextarea.disabled = false; // Notes can always be edited
            }

            // Get all criteria
            const allCriteria = await DataManager.getCriteria();
            
            // Group the criteria using their database group (criterion_groups).
            // The database is the only definition of a group, and of whether that
            // group is a penalty — no name matching, no hardcoded lists.
            const groupedCriteria = {};
            const groupOrder = [];
            allCriteria.forEach(criterion => {
                const groupName = (criterion.group && criterion.group.name) || 'Ungrouped';
                if (!groupedCriteria[groupName]) {
                    groupedCriteria[groupName] = {
                        header: groupName,
                        criteria: [],
                        isPenalty: criterion.group ? criterion.group.is_penalty === true : false
                    };
                    groupOrder.push(groupName);
                }
                groupedCriteria[groupName].criteria.push(criterion);
            });

            // Ungrouped always renders last; otherwise keep the database's order
            const ungroupedIndex = groupOrder.indexOf('Ungrouped');
            if (ungroupedIndex !== -1) {
                groupOrder.splice(ungroupedIndex, 1);
                groupOrder.push('Ungrouped');
            }

            // Remember the criteria so the running total uses the same objects
            this.currentCriteria = allCriteria;

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
                    
                    // The deduction group says "leave blank for none" once, above the
                    // rows; repeating it per field made every row unreadable.
                    // the range is its own span so it never breaks across lines
                    const rangeLabel = isPenalty
                        ? `${criterion.name}`
                        : `${criterion.name} <span class="criterion-range">(${minScore}–${maxScore})</span>`;

                    // One tap per score, no keyboard: a row of chips, each its own
                    // value. Penalty criteria get a "None" chip so "nothing to deduct"
                    // is a choice rather than an empty box.
                    const chips = [];
                    if (isPenalty) {
                        chips.push(`<button type="button" class="score-chip score-chip--none"
                            data-value="none" aria-pressed="false"
                            onclick="JudgeView.setScore('${criterion.id}', null)">None</button>`);
                    }
                    // penalty rows start at 1: the "None" chip already means zero
                    const firstChip = isPenalty ? Math.max(minScore, 1) : minScore;
                    for (let value = firstChip; value <= maxScore; value++) {
                        chips.push(`<button type="button" class="score-chip"
                            data-value="${value}" aria-pressed="false"
                            onclick="JudgeView.setScore('${criterion.id}', ${value})">${value}</button>`);
                    }

                    return `
                        <div class="criterion-item" data-criterion-row="${criterion.id}">
                            <label>${rangeLabel}</label>
                            <div class="score-chips" style="--chips:${chips.length}" role="group"
                                 aria-label="${criterion.name}, ${minScore} to ${maxScore}${isPenalty ? ', deducted' : ''}">
                                ${chips.join('')}
                            </div>
                        </div>
                    `;
                }).join('');
                
                // Add penalty indicator text for Preparation group
                const penaltyIndicator = isPenalty ? 
                    '<p class="penalty-indicator">Deducts from the total. Leave it on None when there is nothing to deduct.</p>' : '';
                
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
            
            // Render the groups the database defines, keeping the familiar layout:
            // Content full width, Language and Presentation side by side, Preparation
            // full width, then any other group, then ungrouped criteria last.
            const container = document.getElementById('criteria-scores');
            const rendered = new Set();
            const renderIfPresent = (name) => {
                const groupData = groupedCriteria[name];
                if (!groupData || groupData.criteria.length === 0 || rendered.has(name)) {
                    return '';
                }
                rendered.add(name);
                return renderGroup(groupData);
            };

            let htmlOutput = renderIfPresent('Content');

            const languageHtml = renderIfPresent('Language');
            const presentationHtml = renderIfPresent('Presentation');
            if (languageHtml && presentationHtml) {
                htmlOutput += '<div class="criterion-groups-row">' + languageHtml + presentationHtml + '</div>';
            } else {
                htmlOutput += languageHtml + presentationHtml;
            }

            htmlOutput += renderIfPresent('Preparation');

            groupOrder.forEach(name => {
                htmlOutput += renderIfPresent(name);
            });

            container.innerHTML = htmlOutput;
            this.paintScoreChips();
            this.lockChips(this.currentSubmitted);
            this.calculateTotal();
            this.updateButtonStates().catch(error => {
                console.error('Error updating button states:', error);
            });
        } catch (error) {
            console.error('Error selecting student:', error);
            UI.toast('Error loading student. Please try again.', { type: 'error' });
        }
    },

    rowForCriterion(criterionId) {
        return document.querySelector(`.criterion-item[data-criterion-row="${criterionId}"]`);
    },

    labelForCriterion(criterionId) {
        const row = this.rowForCriterion(criterionId);
        const label = row && row.querySelector('label');
        return label ? label.textContent.replace(/:\s*$/, '') : 'Unknown';
    },

    /**
     * Set one criterion, from a chip. Tapping the value that is already chosen
     * clears it, so a mistake is one tap to undo and there is nothing to retype.
     * @param {string} criterionId
     * @param {number|null} value  null clears (and is the only choice on a penalty)
     */
    setScore(criterionId, value) {
        if (!this.currentStudentId) return;

        const criterion = (this.currentCriteria || []).find(c => c.id === criterionId);
        if (!criterion) {
            console.error(`Unknown criterion ${criterionId}`);
            return;
        }

        const minScore = criterion.min_score != null ? criterion.min_score : 1;
        const maxScore = criterion.max_score != null ? criterion.max_score : 10;

        let next = value === null || value === undefined || value === '' ? null : Number(value);
        if (next !== null && (isNaN(next) || next < minScore || next > maxScore)) {
            UI.toast(`Score must be between ${minScore} and ${maxScore}.`, { type: 'error' });
            return;
        }

        const current = this.currentScores[criterionId];
        const currentNumber = current === '' || current === null || current === undefined ? null : Number(current);

        // tapping the chosen number again clears it
        if (next !== null && currentNumber === next) next = null;

        this.currentScores[criterionId] = next;
        this.paintScoreChips();
        this.calculateTotal();
        this.updateButtonStates().catch(error => {
            console.error('Error updating button states:', error);
        });
    },

    // kept for anything still calling the old name
    updateScore(criterionId, value) {
        this.setScore(criterionId, value === '' ? null : value);
    },

    /** Repaint every row's chips from currentScores. */
    paintScoreChips() {
        document.querySelectorAll('.criterion-item[data-criterion-row]').forEach(row => {
            const value = this.currentScores[row.dataset.criterionRow];
            const hasValue = value !== '' && value !== null && value !== undefined;
            row.classList.remove('missing', 'invalid');
            row.querySelectorAll('.score-chip').forEach(chip => {
                const chipValue = chip.dataset.value === 'none' ? null : Number(chip.dataset.value);
                const on = hasValue ? chipValue === Number(value) : chipValue === null;
                chip.classList.toggle('on', on);
                chip.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
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
                const criterion = (this.currentCriteria || []).find(c => c.id === criterionId);
                const minScore = criterion && criterion.min_score != null ? criterion.min_score : null;
                const maxScore = criterion && criterion.max_score != null ? criterion.max_score : null;
                
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
        const saveBtn = document.getElementById('save-scores');
        if (!saveBtn) return;

        const setState = (disabled, title) => {
            saveBtn.disabled = disabled;
            saveBtn.classList.toggle('btn-disabled', disabled);
            saveBtn.title = title || '';
        };

        if (!this.currentStudentId) return setState(true, 'Pick a student first');
        if (this.currentSubmitted) return setState(true, 'This student is submitted — scores are locked');

        const validation = this.validateAllScores();
        setState(!validation.isValid, validation.isValid ? '' : 'Fix the highlighted scores first');
    },

    calculateTotal() {
        // One rule, one place: DataManager.totalForJudge subtracts penalty
        // criteria and treats an empty penalty as zero deduction.
        const total = DataManager.totalForJudge(
            this.currentCriteria || [],
            criterion => this.currentScores[criterion.id]
        );

        // The visible denominator: every point that could be awarded. Penalty
        // criteria are subtracted, so they are not part of it.
        const maxTotal = (this.currentCriteria || []).reduce((sum, criterion) =>
            DataManager.isPenaltyCriterion(criterion) ? sum : sum + (criterion.max_score || 0), 0);

        const totalElement = document.getElementById('judge-total-score');
        totalElement.textContent = total;
        totalElement.dataset.max = maxTotal;
    },

    async addScore() {
        if (!this.currentStudentId) {
            UI.toast('Please select a student first', { type: 'error' });
            return;
        }

        if (this.currentSubmitted) {
            UI.toast('This student is already submitted — scores are locked.', { type: 'error' });
            return;
        }

        // Validate all scores before saving
        const validation = this.validateAllScores();
        if (!validation.isValid) {
            const invalidInputs = validation.invalidCriteria.map(id => this.labelForCriterion(id)).filter(Boolean);
            UI.toast(`Fix these scores first: ${invalidInputs.join(', ')}`, { type: 'error' });
            
            // Move the eye to the first row with a problem
            if (validation.invalidCriteria.length > 0) {
                const firstInvalidRow = this.rowForCriterion(validation.invalidCriteria[0]);
                const firstChip = firstInvalidRow && firstInvalidRow.querySelector('.score-chip');
                if (firstChip) firstChip.focus();
            }
            return;
        }

        try {
            const user = await AuthManager.getCurrentUser();
            const criteria = await DataManager.getCriteria();

            // Validate all required criteria are scored (excluding optional criteria: Reading Sentences and Overtime)
            const missingScores = criteria.filter(c => {
                const score = this.currentScores[c.id];
                const isOptional = DataManager.isPenaltyCriterion(c);
                
                // Skip optional criteria from missing scores check
                if (isOptional) {
                    return false;
                }
                
                return !score || score === '';
            });

            if (missingScores.length > 0) {
                // Clear any previous missing-score highlights
                document.querySelectorAll('.criterion-item.missing').forEach(row => row.classList.remove('missing'));

                // Highlight the rows that have no score yet
                const missingCriteriaNames = [];
                missingScores.forEach(criterion => {
                    const row = this.rowForCriterion(criterion.id);
                    if (row) {
                        row.classList.add('missing');
                        missingCriteriaNames.push(criterion.name);
                    }
                });

                // A list does not belong in a toast: name every missing criterion
                const studentLabel = (document.getElementById('current-student-name') || {}).textContent
                    || 'This student';
                await UI.modal.list({
                    title: 'Scores still missing',
                    message: `${studentLabel} still needs a score in:`,
                    items: missingCriteriaNames,
                    confirmLabel: 'Got it'
                });

                // Focus and scroll to the row that needs attention
                if (missingScores.length > 0) {
                    const row = this.rowForCriterion(missingScores[0].id);
                    const chip = row && row.querySelector('.score-chip');
                    if (chip) {
                        chip.focus();
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                    const minScore = criterion.min_score != null ? criterion.min_score : null;
                    const maxScore = criterion.max_score != null ? criterion.max_score : null;

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

            // A chip the judge cleared must not survive in the database
            for (const criterion of criteria) {
                const now = this.currentScores[criterion.id];
                const before = this.savedScores[criterion.id];
                const blank = now === null || now === undefined || now === '';
                const wasSet = before !== null && before !== undefined && before !== '';
                if (blank && wasSet && SupabaseService.deleteScore) {
                    await SupabaseService.deleteScore(this.currentStudentId, user.id, criterion.id);
                }
            }
            this.savedScores = Object.assign({}, this.currentScores);
            this.savedNotes = this.currentNotes;

            const runningTotal = document.getElementById('judge-total-score');
            const maxTotal = (runningTotal && runningTotal.dataset.max) || '40';
            UI.toast('Draft saved · ' + (runningTotal ? runningTotal.textContent : '0') + ' / ' + maxTotal,
                { type: 'success' });
            await this.renderClassList();
            // updateSubmitAllButtonState is called inside renderScoredStudents
        } catch (error) {
            console.error('Error adding score:', error);
            UI.toast('Error adding score. Please try again.', { type: 'error' });
        }
    },

    async submitAllScores() {
        try {
            const user = await AuthManager.getCurrentUser();
            if (!user) return;

            if (!this.selectedGradeId) {
                UI.toast('Pick a grade first.', { type: 'error' });
                return;
            }

            const students = (await GroupManager.getStudentsForJudge(user.id))
                .filter(s => s.group_id === this.selectedGradeId);
            if (!students.length) {
                UI.toast('No students are assigned to this grade.', { type: 'error' });
                return;
            }

            // One bulk pass - statuses and totals come from the same rows the
            // list is drawn from, so what is submitted matches what is on screen.
            await this.renderClassList();
            const rows = this._classRows || [];

            const unfinished = rows.filter(row => row.status !== 'submitted' && !row.complete);
            if (unfinished.length) {
                await UI.modal.list({
                    title: 'Not every student is finished',
                    message: 'Submit All needs a draft for every student. These are not complete:',
                    items: unfinished.map(row => `${row.name} — ${row.scored} of ${row.required} criteria scored`),
                    confirmLabel: 'Got it'
                });
                return;
            }

            const todo = rows.filter(row => row.status !== 'submitted');
            if (!todo.length) {
                UI.toast('Every student in this grade is already submitted.', { type: 'success' });
                return;
            }

            const confirmed = await UI.modal.confirm({
                title: `Submit ${todo.length === 1 ? 'this student' : `all ${todo.length} students`}?`,
                message: 'This is final: the scores lock and you cannot change them afterwards.',
                confirmLabel: 'Submit final scores',
                cancelLabel: 'Keep editing',
                danger: true
            });
            if (!confirmed) return;

            const failures = [];
            let submitted = 0;
            for (const row of todo) {
                try {
                    await DataManager.submitScores(row.id, user.id);
                    submitted++;
                } catch (error) {
                    console.error(`Could not submit ${row.name}:`, error);
                    failures.push(`${row.name} — ${error.message || error}`);
                }
            }

            if (failures.length) {
                await UI.modal.list({
                    title: 'Some students did not submit',
                    message: `${submitted} of ${todo.length} submitted. These failed:`,
                    items: failures,
                    confirmLabel: 'Close'
                });
            } else {
                UI.toast(`Submitted ${submitted} ${submitted === 1 ? 'student' : 'students'} · scores are locked`, { type: 'success' });
            }

            await this.renderClassList();
            await this.updateSubmitAllButtonState();
            if (this.currentStudentId) {
                await this.selectStudent(this.currentStudentId);
            }
        } catch (error) {
            console.error('Error submitting all scores:', error);
            UI.toast('Could not submit the grade. Please try again.', { type: 'error' });
        }
    },

    async submitScores() {
        if (!this.currentStudentId) {
            UI.toast('Please select a student first', { type: 'error' });
            return;
        }

        // Validate all scores are within valid range before submitting
        const validation = this.validateAllScores();
        if (!validation.isValid) {
            const invalidInputs = validation.invalidCriteria.map(id => this.labelForCriterion(id)).filter(Boolean);
            UI.toast(`Fix these scores first: ${invalidInputs.join(', ')}`, { type: 'error' });
            
            // Move the eye to the first row with a problem
            if (validation.invalidCriteria.length > 0) {
                const firstInvalidRow = this.rowForCriterion(validation.invalidCriteria[0]);
                const firstChip = firstInvalidRow && firstInvalidRow.querySelector('.score-chip');
                if (firstChip) firstChip.focus();
            }
            return;
        }

        try {
            const user = await AuthManager.getCurrentUser();
            const criteria = await DataManager.getCriteria();

            // Validate all criteria are scored (excluding optional criteria: Reading Sentences and Overtime)
            const missingScores = criteria.filter(c => {
                const score = this.currentScores[c.id];
                const isOptional = DataManager.isPenaltyCriterion(c);
                
                // Skip optional criteria from missing scores check
                if (isOptional) {
                    return false;
                }
                
                return !score || score === '';
            });

            if (missingScores.length > 0) {
                // Clear any previous missing-score highlights
                document.querySelectorAll('.criterion-item.missing').forEach(row => row.classList.remove('missing'));

                // Highlight the rows that have no score yet
                const missingCriteriaNames = [];
                missingScores.forEach(criterion => {
                    const row = this.rowForCriterion(criterion.id);
                    if (row) {
                        row.classList.add('missing');
                        missingCriteriaNames.push(criterion.name);
                    }
                });

                const studentLabel = (document.getElementById('current-student-name') || {}).textContent
                    || 'This student';
                await UI.modal.list({
                    title: 'Scores still missing',
                    message: `${studentLabel} still needs a score in:`,
                    items: missingCriteriaNames,
                    confirmLabel: 'Got it'
                });

                // Focus and scroll to the row that needs attention
                if (missingScores.length > 0) {
                    const row = this.rowForCriterion(missingScores[0].id);
                    const chip = row && row.querySelector('.score-chip');
                    if (chip) {
                        chip.focus();
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                    const minScore = criterion.min_score != null ? criterion.min_score : null;
                    const maxScore = criterion.max_score != null ? criterion.max_score : null;

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

            UI.toast('Scores submitted successfully!', { type: 'success' });
            await this.selectStudent(this.currentStudentId); // Refresh to show locked state
            await this.renderClassList();
        } catch (error) {
            console.error('Error submitting scores:', error);
            UI.toast('Error submitting scores. Please try again.', { type: 'error' });
        }
    },

    /**
     * Check if a criterion is a penalty criterion (belongs to Preparation group)
     * @param {Object} criterion - The criterion object
     * @returns {boolean} - True if penalty, false otherwise
     */
    isPenaltyCriterion(criterion) {
        // Kept for existing call sites; the definition lives in DataManager and
        // comes from criterion_groups.is_penalty in the database.
        return DataManager.isPenaltyCriterion(criterion);
    },

    // kept for anything that still calls the old name
    async renderScoredStudents() {
        return this.renderClassList();
    },

    async updateSubmitAllButtonState() {
        const submitAllBtn = document.getElementById('submit-all-scores');
        if (!submitAllBtn) return;

        const setDisabled = (button, disabled) => {
            if (!button) return;
            button.disabled = disabled;
            button.classList.toggle('btn-disabled', disabled);
        };

        try {
            const user = await AuthManager.getCurrentUser();
            if (!user || !this.selectedGradeId) {
                setDisabled(submitAllBtn, true);
                return;
            }

            const [studentsAll, submissions] = await Promise.all([
                GroupManager.getStudentsForJudge(user.id),
                DataManager.getSubmissions()
            ]);
            const students = studentsAll.filter(s => s.group_id === this.selectedGradeId);
            if (!students.length) {
                setDisabled(submitAllBtn, true);
                return;
            }

            const isSubmitted = student => (submissions[student.id] || []).includes(user.id);
            const allSubmitted = students.every(isSubmitted);

            // Submit All is the final act for the grade: every student needs a
            // complete draft first, and once submitted the judge cannot edit.
            const rows = this._classRows || [];
            const allComplete = rows.length === students.length && rows.every(row =>
                row.status === 'submitted' || row.complete);

            const blocked = allSubmitted || !allComplete;
            setDisabled(submitAllBtn, blocked);
            submitAllBtn.title = allSubmitted
                ? 'Every student in this grade is already submitted'
                : !allComplete
                    ? 'Save a draft for every student first, with a score on every criterion'
                    : 'Submit every student in this grade — scores lock after this';
        } catch (error) {
            console.error('Error updating Submit All button state:', error);
            setDisabled(submitAllBtn, true);
        }
    },

    /**
     * Check if a criterion is a penalty criterion (belongs to Preparation group)
     * @param {Object} criterion - The criterion object
     * @returns {boolean} - True if penalty, false otherwise
     */
    isPenaltyCriterion(criterion) {
        // Kept for existing call sites; the definition lives in DataManager and
        // comes from criterion_groups.is_penalty in the database.
        return DataManager.isPenaltyCriterion(criterion);
    },

    // kept for anything that still calls the old name
    async renderScoredStudents() {
        return this.renderClassList();
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
            UI.toast('Error loading notes. Please try again.', { type: 'error' });
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
                UI.toast('Error: Student ID not found', { type: 'error' });
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

            UI.toast('Notes saved successfully!', { type: 'success' });
            this.hideNotesModal();
            await this.renderClassList();
        } catch (error) {
            console.error('Error saving notes:', error);
            UI.toast('Error saving notes. Please try again.', { type: 'error' });
        }
    }
};

