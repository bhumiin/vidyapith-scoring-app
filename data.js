/**
 * Data Management Module
 * Handles Supabase database persistence and data export functionality
 */

const DataManager = {
    // Cache for frequently accessed data
    _cache: {
        students: null,
        judges: null,
        superJudges: null,
        groups: null,
        criteria: null,
        topics: null,
        scores: null,
        submissions: null
    },

    // Initialize - no longer needed for Supabase, but kept for compatibility
    async init() {
        try {
            await SupabaseService.init();
            // Pre-load data into cache
            await this.refreshCache();
        } catch (error) {
            console.error('Error initializing DataManager:', error);
        }
    },

    // Refresh all cached data
    async refreshCache() {
        try {
            this._cache.students = await SupabaseService.getStudents();
            this._cache.judges = await SupabaseService.getJudges();
            this._cache.superJudges = await SupabaseService.getSuperJudges();
            this._cache.groups = await SupabaseService.getGroups();
            this._cache.criteria = await SupabaseService.getCriteria();
            this._cache.topics = await SupabaseService.getTopics();
            this._cache.scores = await SupabaseService.getAllScores();
            this._cache.submissions = await SupabaseService.getAllSubmissions();
        } catch (error) {
            console.error('Error refreshing cache:', error);
        }
    },

    // ==================== STUDENTS ====================

    async getStudents() {
        try {
            const students = await SupabaseService.getStudents();
            this._cache.students = students;
            return students;
        } catch (error) {
            console.error('Error getting students:', error);
            return this._cache.students || [];
        }
    },

    saveStudents(students) {
        // No-op: Supabase handles persistence automatically
        // Kept for backward compatibility
        this._cache.students = students;
    },

    async addStudent(name) {
        try {
            const newStudent = await SupabaseService.addStudent(name);
            await this.refreshCache();
            return newStudent;
        } catch (error) {
            console.error('Error adding student:', error);
            throw error;
        }
    },

    async removeStudent(id) {
        try {
            await SupabaseService.removeStudent(id);
            await this.refreshCache();
        } catch (error) {
            console.error('Error removing student:', error);
            throw error;
        }
    },

    // ==================== JUDGES ====================

    async getJudges() {
        try {
            const judges = await SupabaseService.getJudges();
            this._cache.judges = judges;
            return judges;
        } catch (error) {
            console.error('Error getting judges:', error);
            return this._cache.judges || [];
        }
    },

    saveJudges(judges) {
        // No-op: Supabase handles persistence automatically
        this._cache.judges = judges;
    },

    async addJudge(name, username, password) {
        try {
            const passwordHash = await PasswordUtils.hashPassword(password);
            const newJudge = await SupabaseService.addJudge(name, username, passwordHash);
            await this.refreshCache();
            return newJudge;
        } catch (error) {
            console.error('Error adding judge:', error);
            throw error;
        }
    },

    async removeJudge(id) {
        try {
            await SupabaseService.removeJudge(id);
            await this.refreshCache();
        } catch (error) {
            console.error('Error removing judge:', error);
            throw error;
        }
    },

    // ==================== SUPER JUDGES ====================

    async getSuperJudges() {
        try {
            const superJudges = await SupabaseService.getSuperJudges();
            this._cache.superJudges = superJudges;
            return superJudges;
        } catch (error) {
            console.error('Error getting super judges:', error);
            return this._cache.superJudges || [];
        }
    },

    saveSuperJudges(superJudges) {
        // No-op: Supabase handles persistence automatically
        this._cache.superJudges = superJudges;
    },

    async addSuperJudge(name, username, password) {
        try {
            const passwordHash = await PasswordUtils.hashPassword(password);
            const newSuperJudge = await SupabaseService.addSuperJudge(name, username, passwordHash);
            await this.refreshCache();
            return newSuperJudge;
        } catch (error) {
            console.error('Error adding super judge:', error);
            throw error;
        }
    },

    async removeSuperJudge(id) {
        try {
            await SupabaseService.removeSuperJudge(id);
            await this.refreshCache();
        } catch (error) {
            console.error('Error removing super judge:', error);
            throw error;
        }
    },

    // ==================== GROUPS ====================

    async getGroups() {
        try {
            const groups = await SupabaseService.getGroups();
            this._cache.groups = groups;
            return groups;
        } catch (error) {
            console.error('Error getting groups:', error);
            return this._cache.groups || [];
        }
    },

    saveGroups(groups) {
        // No-op: Supabase handles persistence automatically
        this._cache.groups = groups;
    },

    // ==================== CRITERIA ====================

    async getCriteria() {
        try {
            const criteria = await SupabaseService.getCriteria();
            this._cache.criteria = criteria;
            return criteria;
        } catch (error) {
            console.error('Error getting criteria:', error);
            return this._cache.criteria || [];
        }
    },

    saveCriteria(criteria) {
        // No-op: Supabase handles persistence automatically
        this._cache.criteria = criteria;
    },

    async addCriterion(name) {
        try {
            const newCriterion = await SupabaseService.addCriterion(name);
            await this.refreshCache();
            return newCriterion;
        } catch (error) {
            console.error('Error adding criterion:', error);
            throw error;
        }
    },

    async removeCriterion(id) {
        try {
            await SupabaseService.removeCriterion(id);
            await this.refreshCache();
        } catch (error) {
            console.error('Error removing criterion:', error);
            throw error;
        }
    },

    // ==================== TOPICS ====================

    async getTopics() {
        try {
            const topics = await SupabaseService.getTopics();
            this._cache.topics = topics;
            return topics;
        } catch (error) {
            console.error('Error getting topics:', error);
            return this._cache.topics || [];
        }
    },

    async getTopicsByGroup(groupId) {
        try {
            const topics = await SupabaseService.getTopicsByGroup(groupId);
            return topics;
        } catch (error) {
            console.error('Error getting topics by group:', error);
            return [];
        }
    },

    saveTopics(topics) {
        // No-op: Supabase handles persistence automatically
        this._cache.topics = topics;
    },

    async addTopic(name, groupId, timeLimit) {
        try {
            const newTopic = await SupabaseService.addTopic(name, groupId, timeLimit);
            await this.refreshCache();
            return newTopic;
        } catch (error) {
            console.error('Error adding topic:', error);
            throw error;
        }
    },

    async removeTopic(id) {
        try {
            await SupabaseService.removeTopic(id);
            await this.refreshCache();
        } catch (error) {
            console.error('Error removing topic:', error);
            throw error;
        }
    },

    // ==================== SCORES ====================

    async getScores() {
        try {
            const scoresArray = await SupabaseService.getAllScores();
            // Convert array to nested object structure for backward compatibility
            const scoresObj = {};
            scoresArray.forEach(score => {
                if (!scoresObj[score.student_id]) {
                    scoresObj[score.student_id] = {};
                }
                if (!scoresObj[score.student_id][score.judge_id]) {
                    scoresObj[score.student_id][score.judge_id] = {};
                }
                scoresObj[score.student_id][score.judge_id][score.criterion_id] = score.score;
            });
            this._cache.scores = scoresObj;
            return scoresObj;
        } catch (error) {
            console.error('Error getting scores:', error);
            return this._cache.scores || {};
        }
    },

    saveScores(scores) {
        // No-op: Supabase handles persistence automatically
        this._cache.scores = scores;
    },

    async setScore(studentId, judgeId, criterionId, score) {
        try {
            await SupabaseService.setScore(studentId, judgeId, criterionId, score);
            await this.refreshCache();
        } catch (error) {
            console.error('Error setting score:', error);
            throw error;
        }
    },

    async getScore(studentId, judgeId, criterionId) {
        try {
            const score = await SupabaseService.getScore(studentId, judgeId, criterionId);
            return score;
        } catch (error) {
            console.error('Error getting score:', error);
            return null;
        }
    },

    // ==================== SUBMISSIONS ====================

    async getSubmissions() {
        try {
            const submissionsArray = await SupabaseService.getAllSubmissions();
            // Convert array to nested object structure for backward compatibility
            const submissionsObj = {};
            submissionsArray.forEach(submission => {
                if (!submissionsObj[submission.student_id]) {
                    submissionsObj[submission.student_id] = [];
                }
                if (!submissionsObj[submission.student_id].includes(submission.judge_id)) {
                    submissionsObj[submission.student_id].push(submission.judge_id);
                }
            });
            this._cache.submissions = submissionsObj;
            return submissionsObj;
        } catch (error) {
            console.error('Error getting submissions:', error);
            return this._cache.submissions || {};
        }
    },

    saveSubmissions(submissions) {
        // No-op: Supabase handles persistence automatically
        this._cache.submissions = submissions;
    },

    async submitScores(studentId, judgeId) {
        try {
            await SupabaseService.submitScores(studentId, judgeId);
            await this.refreshCache();
        } catch (error) {
            console.error('Error submitting scores:', error);
            throw error;
        }
    },

    async isSubmitted(studentId, judgeId) {
        try {
            return await SupabaseService.isSubmitted(studentId, judgeId);
        } catch (error) {
            console.error('Error checking submission:', error);
            return false;
        }
    },

    async unlockScores(studentId, judgeId) {
        try {
            await SupabaseService.unlockScores(studentId, judgeId);
            await this.refreshCache();
        } catch (error) {
            console.error('Error unlocking scores:', error);
            throw error;
        }
    },

    // ==================== JUDGE NOTES ====================

    async getNote(studentId, judgeId) {
        try {
            const note = await SupabaseService.getNote(studentId, judgeId);
            return note;
        } catch (error) {
            console.error('Error getting note:', error);
            return null;
        }
    },

    async setNote(studentId, judgeId, notes) {
        try {
            await SupabaseService.setNote(studentId, judgeId, notes);
        } catch (error) {
            console.error('Error setting note:', error);
            throw error;
        }
    },

    // ==================== UTILITY FUNCTIONS ====================

    generateId() {
        // UUIDs are generated by Supabase, but keep for backward compatibility
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    hashPassword(password) {
        // Deprecated: Use PasswordUtils.hashPassword instead
        // Kept for backward compatibility
        console.warn('DataManager.hashPassword is deprecated. Use PasswordUtils.hashPassword instead.');
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    },

    // ==================== EXPORT FUNCTIONS ====================

    async exportToCSV() {
        try {
            const students = await this.getStudents();
            const judges = await this.getJudges();
            const criteria = await this.getCriteria();
            const groups = await this.getGroups();
            const scores = await this.getScores();
            const submissions = await this.getSubmissions();

            const rows = [];
            rows.push(['Student', 'Group', 'Judge', 'Criterion', 'Score', 'Submitted']);

            students.forEach(student => {
                const group = groups.find(g => g.id === student.group_id);
                const groupName = group ? group.name : 'Unassigned';

                judges.forEach(judge => {
                    criteria.forEach(criterion => {
                        const score = scores[student.id]?.[judge.id]?.[criterion.id];
                        const submitted = submissions[student.id]?.includes(judge.id) || false;
                        if (score !== null && score !== undefined) {
                            rows.push([
                                student.name,
                                groupName,
                                judge.name,
                                criterion.name,
                                score,
                                submitted ? 'Yes' : 'No'
                            ]);
                        }
                    });
                });
            });

            const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vidyapith_scores_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            alert('Error exporting to CSV. Please try again.');
        }
    },

    async exportToExcel() {
        try {
            if (typeof XLSX === 'undefined') {
                alert('Excel export library not loaded. Please refresh the page.');
                return;
            }

            const students = await this.getStudents();
            const judges = await this.getJudges();
            const criteria = await this.getCriteria();
            const groups = await this.getGroups();
            const scores = await this.getScores();
            const submissions = await this.getSubmissions();

            // Raw data sheet
            const rawData = [['Student', 'Group', 'Judge', 'Criterion', 'Score', 'Submitted']];
            students.forEach(student => {
                const group = groups.find(g => g.id === student.group_id);
                const groupName = group ? group.name : 'Unassigned';

                judges.forEach(judge => {
                    criteria.forEach(criterion => {
                        const score = scores[student.id]?.[judge.id]?.[criterion.id];
                        const submitted = submissions[student.id]?.includes(judge.id) || false;
                        if (score !== null && score !== undefined) {
                            rawData.push([
                                student.name,
                                groupName,
                                judge.name,
                                criterion.name,
                                score,
                                submitted ? 'Yes' : 'No'
                            ]);
                        }
                    });
                });
            });

            // Summary sheet - Student totals
            const summaryData = [['Student', 'Group', 'Total Score', 'Number of Judges', 'Average Score']];
            
            // Get group-judge relationships
            const groupJudgesMap = {};
            for (const group of groups) {
                const judgeIds = await SupabaseService.getGroupJudges(group.id);
                groupJudgesMap[group.id] = judgeIds;
            }

            students.forEach(student => {
                const group = groups.find(g => g.id === student.group_id);
                const groupName = group ? group.name : 'Unassigned';
                const groupJudgeIds = group ? (groupJudgesMap[group.id] || []) : [];
                const groupJudges = judges.filter(j => groupJudgeIds.includes(j.id));

                let totalScore = 0;
                let judgeCount = 0;

                groupJudges.forEach(judge => {
                    let judgeTotal = 0;
                    let hasScores = false;
                    criteria.forEach(criterion => {
                        const score = scores[student.id]?.[judge.id]?.[criterion.id];
                        if (score !== null && score !== undefined) {
                            judgeTotal += score;
                            hasScores = true;
                        }
                    });
                    if (hasScores) {
                        totalScore += judgeTotal;
                        judgeCount++;
                    }
                });

                if (judgeCount > 0) {
                    summaryData.push([
                        student.name,
                        groupName,
                        totalScore,
                        judgeCount,
                        (totalScore / judgeCount).toFixed(2)
                    ]);
                }
            });

            const wb = XLSX.utils.book_new();
            wb.SheetNames.push('Raw Data', 'Summary');
            wb.Sheets['Raw Data'] = XLSX.utils.aoa_to_sheet(rawData);
            wb.Sheets['Summary'] = XLSX.utils.aoa_to_sheet(summaryData);

            XLSX.writeFile(wb, `vidyapith_scores_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Error exporting to Excel. Please try again.');
        }
    },

    async exportConfig() {
        try {
            const config = {
                students: await this.getStudents(),
                judges: await this.getJudges(),
                superJudges: await this.getSuperJudges(),
                groups: await this.getGroups(),
                criteria: await this.getCriteria(),
                scores: await this.getScores(),
                submissions: await this.getSubmissions()
            };
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vidyapith_config_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting config:', error);
            alert('Error exporting configuration. Please try again.');
        }
    },

    async importConfig(jsonData) {
        try {
            const config = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            // Import students
            if (config.students) {
                for (const student of config.students) {
                    try {
                        await this.addStudent(student.name);
                        if (student.groupId) {
                            await SupabaseService.updateStudentGroup(student.id, student.groupId);
                        }
                    } catch (error) {
                        console.error('Error importing student:', error);
                    }
                }
            }

            // Import judges
            if (config.judges) {
                for (const judge of config.judges) {
                    try {
                        // Note: We can't import password hashes directly - would need original passwords
                        // For now, skip password and let admin reset
                        await this.addJudge(judge.name, judge.username, 'temp123');
                    } catch (error) {
                        console.error('Error importing judge:', error);
                    }
                }
            }

            // Import super judges
            if (config.superJudges) {
                for (const superJudge of config.superJudges) {
                    try {
                        await this.addSuperJudge(superJudge.name, superJudge.username, 'temp123');
                    } catch (error) {
                        console.error('Error importing super judge:', error);
                    }
                }
            }

            // Import groups
            if (config.groups) {
                for (const group of config.groups) {
                    try {
                        await SupabaseService.addGroup(group.name);
                    } catch (error) {
                        console.error('Error importing group:', error);
                    }
                }
            }

            // Import criteria
            if (config.criteria) {
                for (const criterion of config.criteria) {
                    try {
                        await this.addCriterion(criterion.name);
                    } catch (error) {
                        console.error('Error importing criterion:', error);
                    }
                }
            }

            // Import scores
            if (config.scores) {
                for (const studentId in config.scores) {
                    for (const judgeId in config.scores[studentId]) {
                        for (const criterionId in config.scores[studentId][judgeId]) {
                            try {
                                await this.setScore(
                                    studentId,
                                    judgeId,
                                    criterionId,
                                    config.scores[studentId][judgeId][criterionId]
                                );
                            } catch (error) {
                                console.error('Error importing score:', error);
                            }
                        }
                    }
                }
            }

            // Import submissions
            if (config.submissions) {
                for (const studentId in config.submissions) {
                    for (const judgeId of config.submissions[studentId]) {
                        try {
                            await this.submitScores(studentId, judgeId);
                        } catch (error) {
                            console.error('Error importing submission:', error);
                        }
                    }
                }
            }

            await this.refreshCache();
            return true;
        } catch (error) {
            console.error('Import error:', error);
            return false;
        }
    }
};

// Initialize on load (async)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DataManager.init());
} else {
    DataManager.init();
}
