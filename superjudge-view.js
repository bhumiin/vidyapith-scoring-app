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
            await this.renderTopicsDisplay();
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
        await this.renderTopicsDisplay();
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
                        title="Grade ${group.name}"
                        aria-label="Grade ${group.name}"
                        onclick="SuperJudgeView.selectGrade('${group.id}')"
                    >
                        ${group.name}
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
        await this.renderTopicsDisplay();
        await this.renderStudents();
    },

    async renderTopicsDisplay() {
        try {
            const container = document.getElementById('superjudge-topics-display');
            if (!container) {
                return;
            }
            
            // If no grade is selected, clear topics display
            if (!this.selectedGradeId) {
                container.innerHTML = '';
                return;
            }

            // Fetch topics for the selected grade
            const topics = await DataManager.getTopicsByGroup(this.selectedGradeId);
            
            if (!topics || topics.length === 0) {
                container.innerHTML = '';
                return;
            }

            // Format topics with name and time limit
            const topicsHTML = topics.map(topic => {
                const timeLimitText = topic.time_limit !== null && topic.time_limit !== undefined 
                    ? ` (${topic.time_limit} min)` 
                    : '';
                return `<div class="topic-item">${topic.name}${timeLimitText}</div>`;
            }).join('');

            container.innerHTML = topicsHTML;
        } catch (error) {
            console.error('Error rendering topics display:', error);
            const container = document.getElementById('superjudge-topics-display');
            if (container) {
                container.innerHTML = '';
            }
        }
    },

    async renderStudents() {
        try {
            const container = document.getElementById('superjudge-students-list');
            
            // If no grade is selected, show empty message
            if (!this.selectedGradeId) {
                container.innerHTML = '<p class="empty-message">Select a grade to view students</p>';
                await this.renderTopicsDisplay(); // Clear topics when no grade selected
                return;
            }

            let students = await DataManager.getStudents();

            // Filter by selected grade
            students = students.filter(s => s.group_id === this.selectedGradeId);

            const groups = await DataManager.getGroups();
            const group = groups.find(g => g.id === this.selectedGradeId);
            const titleEl = document.getElementById('sj-title');
            if (titleEl) titleEl.textContent = group ? `Grade ${group.name} standings` : 'Standings';

            await this.renderStudentsList(students);
        } catch (error) {
            console.error('Error rendering students:', error);
        }
    },

    /**
     * The three numbers a super judge reads first: who leads, what the grade
     * averages, and how much of the round is final.
     */
    renderSummary(rows, maxTotal) {
        const host = document.getElementById('superjudge-stats');
        const meta = document.getElementById('sj-meta');
        if (!host) return;

        const finished = rows.filter(row => row.allSubmitted && !row.absent);
        const scorable = rows.filter(row => !row.absent);
        const leader = finished[0] || null;
        const gradeAvg = finished.length
            ? finished.reduce((sum, row) => sum + row.avgScore, 0) / finished.length
            : null;

        const stat = (label, value, unit, detail, cls) => `
            <div class="sj-stat ${cls || ''}">
                <span class="sj-stat__l">${label}</span>
                <span class="sj-stat__v">${value}${unit ? `<small>${unit}</small>` : ''}</span>
                <span class="sj-stat__d">${detail}</span>
            </div>`;

        const judgeSlots = rows.reduce((sum, row) => sum + row.scoringJudges.length, 0);
        const judgeDone = rows.reduce((sum, row) =>
            sum + row.judgeScores.filter(js => js.submitted).length, 0);
        const absentCount = rows.length - scorable.length;

        host.innerHTML = [
            leader ? stat('Leader', leader.avgScore.toFixed(2), `/${maxTotal}`, leader.student.name, 'is-lead')
                   : stat('Leader', '—', '', 'No student is final yet', 'is-quiet'),
            stat('Grade average', gradeAvg === null ? '—' : gradeAvg.toFixed(2), gradeAvg === null ? '' : `/${maxTotal}`,
                finished.length ? `across ${finished.length} ${finished.length === 1 ? 'student' : 'students'}` : 'nothing final yet', ''),
            stat('Scores in', `${judgeDone}`, ` of ${judgeSlots}`,
                absentCount ? `${absentCount} absent` : 'judge submissions', '')
        ].join('');

        if (meta) {
            const pending = scorable.length - finished.length;
            const parts = [`${rows.length} ${rows.length === 1 ? 'student' : 'students'}`,
                           `${finished.length} final`];
            if (pending) parts.push(`${pending} in progress`);
            if (absentCount) parts.push(`${absentCount} absent`);
            meta.textContent = parts.join(' · ');
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

            // Helper function to organize criteria in the same order as Judge view
            const criteriaGroupMapping = {
                'Content': {
                    criteriaNames: ['Ideas Examples', 'Ideas Example', 'Values based examples', 'Relate to topic and reflect'],
                    keywords: ['ideas', 'values', 'relate to topic']
                },
                'Language': {
                    criteriaNames: ['Creativity Language'],
                    keywords: ['creativity language', 'language']
                },
                'Presentation': {
                    criteriaNames: ['Confidence Style Effectiveness'],
                    keywords: ['confidence', 'style', 'effectiveness', 'presentation']
                },
                'Preparation': {
                    criteriaNames: ['Reading Sentences', 'Overtime (contd. after 2nd bell)'],
                    keywords: ['reading', 'sentences', 'overtime', 'preparation']
                }
            };
            
            const groupOrder = ['Content', 'Language', 'Presentation', 'Preparation'];
            
            const organizeCriteria = (criteriaList) => {
                // Organize criteria into groups
                const groupedCriteria = {};
                groupOrder.forEach(groupName => {
                    groupedCriteria[groupName] = [];
                });
                groupedCriteria['Ungrouped'] = [];
                
                // Assign criteria to groups
                criteriaList.forEach(criterion => {
                    let assigned = false;
                    const criterionNameLower = criterion.name.toLowerCase();
                    
                    for (const groupName in criteriaGroupMapping) {
                        const groupMapping = criteriaGroupMapping[groupName];
                        
                        const exactMatch = groupMapping.criteriaNames.some(name => 
                            criterionNameLower === name.toLowerCase() ||
                            criterionNameLower.includes(name.toLowerCase()) || 
                            name.toLowerCase().includes(criterionNameLower)
                        );
                        
                        const keywordMatch = groupMapping.keywords && groupMapping.keywords.some(keyword => 
                            criterionNameLower.includes(keyword.toLowerCase())
                        );
                        
                        if (exactMatch || keywordMatch) {
                            groupedCriteria[groupName].push(criterion);
                            assigned = true;
                            break;
                        }
                    }
                    if (!assigned) {
                        groupedCriteria['Ungrouped'].push(criterion);
                    }
                });
                
                // Sort criteria within each group
                groupOrder.forEach(groupName => {
                    if (groupedCriteria[groupName] && criteriaGroupMapping[groupName]) {
                        const order = criteriaGroupMapping[groupName].criteriaNames;
                        groupedCriteria[groupName].sort((a, b) => {
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
                
                // Flatten into ordered array
                const orderedCriteria = [];
                groupOrder.forEach(groupName => {
                    orderedCriteria.push(...groupedCriteria[groupName]);
                });
                orderedCriteria.push(...groupedCriteria['Ungrouped']);
                
                return { orderedCriteria, groupedCriteria };
            };
            
            const { orderedCriteria, groupedCriteria } = organizeCriteria(criteria);

            // An absent student is excluded by their judges, not scored zero.
            // Their excluders leave the average, and a student every judge
            // excluded reads as Absent instead of last place on 0.
            const exclusionIndex = await DataManager.getExclusionsDetailed();
            
            // Hardcoded penultimate criteria (to be displayed in red)
            const penultimateCriteriaNames = new Set([
                'Reading Sentences',
                'Overtime (contd. after 2nd bell)'
            ]);

            // First, collect all student data with scores
            const studentsWithScores = await Promise.all(students.map(async student => {
                const group = groups.find(g => g.id === student.group_id);
                const groupJudges = await GroupManager.getJudgesForStudent(student.id);

                const excludedBy = new Set(((exclusionIndex[student.id] || {}).judges) || []);
                const reasons = (exclusionIndex[student.id] || {}).reasons || {};
                const scoringJudges = groupJudges.filter(judge => !excludedBy.has(judge.id));
                const absent = groupJudges.length > 0 && scoringJudges.length === 0;
                const allSubmitted = !absent && scoringJudges.length > 0
                    && (await Promise.all(scoringJudges.map(j => DataManager.isSubmitted(student.id, j.id))))
                        .every(Boolean);

                // Calculate scores using ordered criteria
                let totalScore = 0;
                const judgeScores = await Promise.all(groupJudges.map(async judge => {
                    if (excludedBy.has(judge.id)) {
                        return {
                            judge: judge,
                            scores: [],
                            total: null,
                            submitted: false,
                            excluded: true,
                            exclusionReason: reasons[judge.id] || ''
                        };
                    }
                    const scoreById = {};
                    const scores = await Promise.all(orderedCriteria.map(async criterion => {
                        const score = await DataManager.getScore(student.id, judge.id, criterion.id);
                        scoreById[criterion.id] = score;
                        return {
                            criterion: criterion.name,
                            criterionId: criterion.id,
                            score: score,
                            max: criterion.max_score,
                            isPenalty: DataManager.isPenaltyCriterion(criterion)
                        };
                    }));
                    // Same rule as the judge's own screen: penalty criteria are
                    // deducted, and a blank penalty costs nothing.
                    const judgeTotal = DataManager.totalForJudge(
                        orderedCriteria, criterion => scoreById[criterion.id]);
                    totalScore += judgeTotal;
                    const submitted = await DataManager.isSubmitted(student.id, judge.id);
                    return {
                        judge: judge,
                        scores: scores,
                        total: judgeTotal,
                        submitted: submitted
                    };
                }));

                const avgScore = scoringJudges.length > 0
                    ? parseFloat((totalScore / scoringJudges.length).toFixed(2))
                    : 0;

                return {
                    student: student,
                    group: group,
                    groupJudges: groupJudges,
                    scoringJudges: scoringJudges,
                    excludedCount: excludedBy.size,
                    absent: absent,
                    allSubmitted: allSubmitted,
                    totalScore: totalScore,
                    avgScore: avgScore,
                    judgeScores: judgeScores
                };
            }));

            // Sort students: first by allSubmitted (true first), then by avgScore (descending), then by name (ascending) for tie-breaking
            studentsWithScores.sort((a, b) => {
                // First, prioritize students with all submitted
                if (a.allSubmitted !== b.allSubmitted) {
                    return b.allSubmitted ? 1 : -1;
                }
                // Then sort by average score (descending)
                if (a.avgScore !== b.avgScore) {
                    return b.avgScore - a.avgScore;
                }
                // Finally, sort alphabetically by name for tie-breaking
                return a.student.name.localeCompare(b.student.name);
            });

            const maxTotal = orderedCriteria.reduce((sum, criterion) =>
                DataManager.isPenaltyCriterion(criterion) ? sum : sum + Number(criterion.max_score || 0), 0);

            // Rank on the students who are finished; anyone still waiting keeps a
            // dash so the standings do not move around mid-round.
            let position = 0;
            let lastAvg = null;
            const studentCards = studentsWithScores.map((studentData, index) => {
                const { student, scoringJudges, excludedCount, absent,
                        allSubmitted, totalScore, avgScore, judgeScores } = studentData;

                let rank = '–';
                let rankClass = '';
                if (allSubmitted && !absent) {
                    // ties share a place: 32.00 twice reads 2, 2, then 4
                    if (lastAvg === null || Math.abs(avgScore - lastAvg) > 0.001) {
                        position = index + 1;     // competition ranking: 1, 2, 2, 4
                        lastAvg = avgScore;
                    }
                    rank = String(position);
                    if (position === 1) rankClass = 'is-gold';
                    else if (position === 2) rankClass = 'is-silver';
                    else if (position === 3) rankClass = 'is-bronze';
                }

                const initials = name => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
                const submittedCount = judgeScores.filter(js => js.submitted).length;
                const waiting = scoringJudges.length - submittedCount;
                const pct = maxTotal > 0 ? Math.min(100, Math.round((avgScore / maxTotal) * 100)) : 0;

                const status = absent
                    ? '<span class="sj-pill is-absent">Absent</span>'
                    : allSubmitted
                        ? '<span class="sj-pill is-final">Final</span>'
                        : '<span class="sj-pill is-wait">Awaiting</span>';

                const scored = judgeScores.filter(js => !js.excluded && js.total !== null);
                const spread = scored.length
                    ? (() => {
                        const totals = scored.map(js => js.total);
                        const low = Math.min(...totals);
                        const high = Math.max(...totals);
                        return low === high ? 'All judges agree' : `Judges ${low}–${high}`;
                    })()
                    : '';

                const sub = absent
                    ? 'Excluded by every judge'
                    : allSubmitted
                        ? spread
                        : waiting === 0
                            ? 'Every judge is in'
                            : `${waiting} ${waiting === 1 ? 'judge is' : 'judges are'} still scoring`;

                const judgeBlocks = judgeScores.map(js => {
                    if (js.excluded) {
                        return `
                            <div class="sj-judge is-out">
                                <div class="sj-judge__head">
                                    <span class="sj-judge__name">${js.judge.name}</span>
                                    <span class="sj-pill is-absent">Excluded${js.exclusionReason ? ` · ${js.exclusionReason}` : ''}</span>
                                </div>
                            </div>`;
                    }
                    const chips = js.scores.map(s => {
                        const has = s.score !== null && s.score !== undefined && s.score !== '';
                        const value = has ? `${s.score}<small>/${s.max ?? '–'}</small>`
                            : (s.isPenalty ? '<i>none</i>' : '—');
                        return `
                            <span class="sj-crit${s.isPenalty ? ' is-penalty' : ''}">
                                <span class="sj-crit__n">${s.criterion}</span>
                                <b class="sj-crit__v">${value}</b>
                            </span>`;
                    }).join('');

                    return `
                        <div class="sj-judge">
                            <div class="sj-judge__head">
                                <span class="sj-judge__name">${js.judge.name}</span>
                                ${js.submitted ? '<span class="sj-pill is-final">Submitted</span>' : '<span class="sj-pill is-wait">Draft</span>'}
                                <span class="sj-judge__total">${js.total}<small>/${maxTotal}</small></span>
                                <button type="button" class="sj-edit"
                                        title="${js.submitted ? 'Super judge override — changes a locked score' : 'Edit this judge draft'}"
                                        onclick="SuperJudgeView.editJudgeScores('${student.id}', '${js.judge.id}')">${js.submitted ? 'Override' : 'Edit'}</button>
                            </div>
                            <div class="sj-crits">${chips}</div>
                        </div>`;
                }).join('');

                return `
                    <details class="sj-row${allSubmitted ? ' is-final' : ''}${absent ? ' is-absent' : ''}">
                        <summary class="sj-row__sum">
                            <span class="sj-pos${rankClass ? ' ' + rankClass : ' is-none'}">${rank}</span>
                            <span class="sj-who">
                                <span class="sj-av">${initials(student.name)}</span>
                                <span class="sj-who__t">
                                    <span class="sj-who__n">${student.name}</span>
                                    <span class="sj-who__s">${sub}</span>
                                </span>
                            </span>
                            <span class="sj-score">
                                ${absent ? '<span class="sj-score__n is-muted">—</span>'
                                        : `<span class="sj-score__n${allSubmitted ? '' : ' is-provisional'}"
                                                 title="${allSubmitted ? 'Final average' : 'Provisional — not every judge has submitted'}">${avgScore.toFixed(2)}<small> /${maxTotal}</small></span>
                                           <span class="sj-meter${allSubmitted ? '' : ' is-provisional'}"><i style="width:${pct}%"></i></span>`}
                            </span>
                            <span class="sj-judges">${absent ? '—' : `${submittedCount} of ${scoringJudges.length}`}</span>
                            <span class="sj-status">${status}</span>
                        </summary>
                        <div class="sj-break">
                            ${judgeBlocks || '<p class="sj-break__empty">No judges are assigned to this grade yet.</p>'}
                            <div class="sj-break__foot">
                                <span>Total ${totalScore} · average ${avgScore.toFixed(2)} across ${scoringJudges.length}</span>
                                ${excludedCount ? `<span class="sj-pill is-absent">${excludedCount} excluded</span>` : ''}
                            </div>
                        </div>
                    </details>`;
            });

            container.innerHTML = studentCards.join('');

            this.renderSummary(studentsWithScores, maxTotal);
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

            // Organize criteria in the same order as Judge view
            const criteriaGroupMapping = {
                'Content': {
                    criteriaNames: ['Ideas Examples', 'Ideas Example', 'Values based examples', 'Relate to topic and reflect'],
                    keywords: ['ideas', 'values', 'relate to topic']
                },
                'Language': {
                    criteriaNames: ['Creativity Language'],
                    keywords: ['creativity language', 'language']
                },
                'Presentation': {
                    criteriaNames: ['Confidence Style Effectiveness'],
                    keywords: ['confidence', 'style', 'effectiveness', 'presentation']
                },
                'Preparation': {
                    criteriaNames: ['Reading Sentences', 'Overtime (contd. after 2nd bell)'],
                    keywords: ['reading', 'sentences', 'overtime', 'preparation']
                }
            };
            
            const groupOrder = ['Content', 'Language', 'Presentation', 'Preparation'];
            
            // Organize criteria into groups
            const groupedCriteria = {};
            groupOrder.forEach(groupName => {
                groupedCriteria[groupName] = [];
            });
            groupedCriteria['Ungrouped'] = [];
            
            criteria.forEach(criterion => {
                let assigned = false;
                const criterionNameLower = criterion.name.toLowerCase();
                
                for (const groupName in criteriaGroupMapping) {
                    const groupMapping = criteriaGroupMapping[groupName];
                    
                    const exactMatch = groupMapping.criteriaNames.some(name => 
                        criterionNameLower === name.toLowerCase() ||
                        criterionNameLower.includes(name.toLowerCase()) || 
                        name.toLowerCase().includes(criterionNameLower)
                    );
                    
                    const keywordMatch = groupMapping.keywords && groupMapping.keywords.some(keyword => 
                        criterionNameLower.includes(keyword.toLowerCase())
                    );
                    
                    if (exactMatch || keywordMatch) {
                        groupedCriteria[groupName].push(criterion);
                        assigned = true;
                        break;
                    }
                }
                if (!assigned) {
                    groupedCriteria['Ungrouped'].push(criterion);
                }
            });
            
            // Sort criteria within each group
            groupOrder.forEach(groupName => {
                if (groupedCriteria[groupName] && criteriaGroupMapping[groupName]) {
                    const order = criteriaGroupMapping[groupName].criteriaNames;
                    groupedCriteria[groupName].sort((a, b) => {
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
            
            // Flatten into ordered array
            const orderedCriteria = [];
            groupOrder.forEach(groupName => {
                orderedCriteria.push(...groupedCriteria[groupName]);
            });
            orderedCriteria.push(...groupedCriteria['Ungrouped']);
            
            // Hardcoded penultimate criteria (to be displayed in red)
            const penultimateCriteriaNames = new Set([
                'Reading Sentences',
                'Overtime (contd. after 2nd bell)'
            ]);
            
            // Define score ranges (same as Judge view)
            const getScoreRange = (criterionName) => {
                const nameLower = criterionName.toLowerCase();
                
                if (nameLower.includes('ideas example')) {
                    return { min: 1, max: 5 };
                }
                if (nameLower.includes('values based examples')) {
                    return { min: 1, max: 10 };
                }
                if (nameLower.includes('relate to topic')) {
                    return { min: 1, max: 5 };
                }
                if (nameLower.includes('creativity language')) {
                    return { min: 1, max: 10 };
                }
                if (nameLower.includes('confidence') || nameLower.includes('style') || nameLower.includes('effectiveness')) {
                    return { min: 1, max: 10 };
                }
                if (nameLower.includes('reading sentences')) {
                    return { min: 1, max: 5 };
                }
                if (nameLower.includes('overtime')) {
                    return { min: 1, max: 5 };
                }
                
                return null;
            };

            // Create modal for editing
            const modal = document.createElement('div');
            modal.className = 'modal';
            
            // Load scores for criteria in order
            const scoreInputs = await Promise.all(orderedCriteria.map(async criterion => {
                const score = await DataManager.getScore(studentId, judgeId, criterion.id);
                
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
                        minScore = criterion.min_score ?? 1;
                        maxScore = criterion.max_score ?? 10;
                    }
                }
                
                // Check if criterion is penultimate (flexible matching)
                const criterionLower = criterion.name.toLowerCase();
                const isPenultimate = Array.from(penultimateCriteriaNames).some(name => 
                    criterionLower.includes(name.toLowerCase()) || 
                    name.toLowerCase().includes(criterionLower)
                );
                const redStyle = isPenultimate ? 'style="color: red;"' : '';
                
                return `
                    <div class="criterion-score-item">
                        <label ${redStyle}>${criterion.name} (${minScore}-${maxScore}):</label>
                        <input 
                            type="number" 
                            min="${minScore}" 
                            max="${maxScore}" 
                            value="${score || ''}" 
                            data-criterion-id="${criterion.id}"
                            data-original="${score === null || score === undefined ? '' : score}"
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
            UI.toast('Error loading scores for editing. Please try again.', { type: 'error' });;
        }
    },

    updateEditScore(criterionId, value) {
        if (value === '' || value === null || value === undefined) {
            return;
        }
        
        const inputElement = document.querySelector(`input[data-criterion-id="${criterionId}"]`);
        if (!inputElement) {
            return;
        }
        
        const minScore = parseInt(inputElement.min) || 1;
        const maxScore = parseInt(inputElement.max) || 10;
        const score = parseInt(value);
        
        if (isNaN(score) || score < minScore || score > maxScore) {
            UI.toast(`Score must be between ${minScore} and ${maxScore}`, { type: 'error' });;
            inputElement.value = '';
            return;
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
                // only write the criteria the super judge actually changed
                if (value && value === input.dataset.original) continue;
                if (value && value !== '') {
                    const score = parseInt(value);
                    const minScore = parseInt(input.min) || 1;
                    const maxScore = parseInt(input.max) || 10;
                    if (!isNaN(score) && score >= minScore && score <= maxScore) {
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
            UI.toast('Error saving scores. Please try again.', { type: 'error' });;
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
            UI.toast('Please select a grade first', { type: 'error' });;
            return;
        }
        
        const checkboxes = document.querySelectorAll('#superjudge-judge-checkbox-list .judge-checkbox:checked');
        if (checkboxes.length === 0) {
            UI.toast('Please select at least one judge', { type: 'error' });;
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
            UI.toast('Error assigning judges. Please try again.', { type: 'error' });;
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
            UI.toast('Please enter a grade name', { type: 'error' });;
            return;
        }

        try {
            await GroupManager.createGroup(name);
            document.getElementById('superjudge-group-name').value = '';
            await this.renderGroups();
            await this.renderGradeButtons();
        } catch (error) {
            console.error('Error adding group:', error);
            UI.toast('Error creating group. Please try again.', { type: 'error' });;
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
            UI.toast('Error removing judge. Please try again.', { type: 'error' });;
        }
    },

    async deleteGroup(id) {
        const confirmed = await UI.modal.confirm({
            title: 'Delete this grade?',
            message: 'Its topics and judge assignments are removed. A grade that still has students cannot be deleted.',
            confirmLabel: 'Delete grade',
            danger: true
        });
        if (confirmed) {
            try {
                const removed = await GroupManager.deleteGroup(id);
                if (!removed) {
                    UI.toast('Cannot delete this grade — move or remove its students first.', { type: 'error' });
                    return;
                }
                // Clear selection if deleted group was selected
                if (this.selectedGroupIdForManagement === id) {
                    this.selectedGroupIdForManagement = null;
                }
                await this.renderGroups();
                await this.renderGradeButtons();
                await this.renderStudents();
            } catch (error) {
                console.error('Error deleting group:', error);
                UI.toast('Error deleting group. Please try again.', { type: 'error' });;
            }
        }
    },

};

