/**
 * Group Management Module
 * Handles creation, editing, and management of judge groups using Supabase
 */

const GroupManager = {
    /**
     * Create a new judge group
     * @param {string} name - Group name
     * @returns {Promise<object>} - Created group
     */
    async createGroup(name) {
        try {
            const newGroup = await SupabaseService.addGroup(name);
            await DataManager.refreshCache();
            return newGroup;
        } catch (error) {
            console.error('Error creating group:', error);
            throw error;
        }
    },

    /**
     * Update group name
     * @param {string} groupId - Group ID
     * @param {string} newName - New group name
     * @returns {Promise<boolean>}
     */
    async updateGroupName(groupId, newName) {
        try {
            // Note: SupabaseService doesn't have updateGroup method yet
            // For now, we'll need to delete and recreate, or add update method
            // This is a placeholder - you may want to add updateGroup to SupabaseService
            console.warn('updateGroupName not fully implemented - need to add updateGroup to SupabaseService');
            return false;
        } catch (error) {
            console.error('Error updating group name:', error);
            return false;
        }
    },

    /**
     * Delete a group
     * @param {string} groupId - Group ID
     * @returns {Promise<boolean>}
     */
    async deleteGroup(groupId) {
        try {
            await SupabaseService.removeGroup(groupId);
            await DataManager.refreshCache();
            return true;
        } catch (error) {
            console.error('Error deleting group:', error);
            return false;
        }
    },

    /**
     * Assign a judge to a group (judges can belong to multiple groups)
     * @param {string} judgeId - Judge ID
     * @param {string} groupId - Group ID
     * @returns {Promise<boolean>}
     */
    async assignJudgeToGroup(judgeId, groupId) {
        try {
            await SupabaseService.assignJudgeToGroup(judgeId, groupId);
            await DataManager.refreshCache();
            return true;
        } catch (error) {
            console.error('Error assigning judge to group:', error);
            return false;
        }
    },

    /**
     * Remove a judge from a group
     * @param {string} judgeId - Judge ID
     * @param {string} groupId - Group ID
     * @returns {Promise<boolean>}
     */
    async removeJudgeFromGroup(judgeId, groupId) {
        try {
            await SupabaseService.removeJudgeFromGroup(judgeId, groupId);
            await DataManager.refreshCache();
            return true;
        } catch (error) {
            console.error('Error removing judge from group:', error);
            return false;
        }
    },

    /**
     * Assign a student to a group (each student belongs to exactly one group)
     * @param {string} studentId - Student ID
     * @param {string} groupId - Group ID
     * @returns {Promise<boolean>}
     */
    async assignStudentToGroup(studentId, groupId) {
        try {
            await SupabaseService.updateStudentGroup(studentId, groupId);
            await DataManager.refreshCache();
            return true;
        } catch (error) {
            console.error('Error assigning student to group:', error);
            return false;
        }
    },

    /**
     * Remove a student from their group
     * @param {string} studentId - Student ID
     * @returns {Promise<boolean>}
     */
    async removeStudentFromGroup(studentId) {
        try {
            await SupabaseService.updateStudentGroup(studentId, null);
            await DataManager.refreshCache();
            return true;
        } catch (error) {
            console.error('Error removing student from group:', error);
            return false;
        }
    },

    /**
     * Get all students for a judge (based on their groups)
     * @param {string} judgeId - Judge ID
     * @returns {Promise<Array>} - Array of students
     */
    async getStudentsForJudge(judgeId) {
        try {
            const judges = await DataManager.getJudges();
            const judge = judges.find(j => j.id === judgeId);
            if (!judge) return [];

            const students = await DataManager.getStudents();
            const groups = await DataManager.getGroups();

            // Get all group IDs the judge belongs to
            const judgeGroupIds = await SupabaseService.getJudgeGroups(judgeId);

            // Get all students from those groups
            const judgeStudents = students.filter(student => {
                return student.group_id && judgeGroupIds.includes(student.group_id);
            });

            return judgeStudents;
        } catch (error) {
            console.error('Error getting students for judge:', error);
            return [];
        }
    },

    /**
     * Get all judges for a student's group
     * @param {string} studentId - Student ID
     * @returns {Promise<Array>} - Array of judges
     */
    async getJudgesForStudent(studentId) {
        try {
            const students = await DataManager.getStudents();
            const student = students.find(s => s.id === studentId);
            if (!student || !student.group_id) return [];

            const groups = await DataManager.getGroups();
            const group = groups.find(g => g.id === student.group_id);
            if (!group) return [];

            const judges = await DataManager.getJudges();
            const groupJudgeIds = await SupabaseService.getGroupJudges(student.group_id);
            
            return judges.filter(judge => groupJudgeIds.includes(judge.id));
        } catch (error) {
            console.error('Error getting judges for student:', error);
            return [];
        }
    },

    /**
     * Check if all judges in a student's group have submitted scores
     * @param {string} studentId - Student ID
     * @returns {Promise<boolean>}
     */
    async allJudgesSubmittedForStudent(studentId) {
        try {
            const judges = await this.getJudgesForStudent(studentId);
            if (judges.length === 0) return false;

            for (const judge of judges) {
                const submitted = await DataManager.isSubmitted(studentId, judge.id);
                if (!submitted) {
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Error checking if all judges submitted:', error);
            return false;
        }
    },

    /**
     * Get group statistics
     * @param {string} groupId - Group ID
     * @returns {Promise<object|null>}
     */
    async getGroupStats(groupId) {
        try {
            const groups = await DataManager.getGroups();
            const group = groups.find(g => g.id === groupId);
            if (!group) return null;

            const judges = await DataManager.getJudges();
            const students = await DataManager.getStudents();
            const groupJudgeIds = await SupabaseService.getGroupJudges(groupId);
            const groupStudents = students.filter(s => s.group_id === groupId);

            return {
                name: group.name,
                judgeCount: groupJudgeIds.length,
                studentCount: groupStudents.length,
                judges: judges.filter(j => groupJudgeIds.includes(j.id)),
                students: groupStudents
            };
        } catch (error) {
            console.error('Error getting group stats:', error);
            return null;
        }
    },

    /**
     * Validate group assignments
     * @returns {Promise<Array>} - Array of error messages
     */
    async validateAssignments() {
        try {
            const errors = [];
            const groups = await DataManager.getGroups();
            const students = await DataManager.getStudents();
            const judges = await DataManager.getJudges();

            // Check for orphaned students (students assigned to non-existent groups)
            students.forEach(student => {
                if (student.group_id) {
                    const group = groups.find(g => g.id === student.group_id);
                    if (!group) {
                        errors.push(`Student "${student.name}" is assigned to non-existent group`);
                    }
                }
            });

            // Check for orphaned judges (judges assigned to non-existent groups)
            for (const judge of judges) {
                const judgeGroupIds = await SupabaseService.getJudgeGroups(judge.id);
                judgeGroupIds.forEach(groupId => {
                    const group = groups.find(g => g.id === groupId);
                    if (!group) {
                        errors.push(`Judge "${judge.name}" is assigned to non-existent group`);
                    }
                });
            }

            // Check for groups with invalid judge/student references
            for (const group of groups) {
                const groupJudgeIds = await SupabaseService.getGroupJudges(group.id);
                groupJudgeIds.forEach(judgeId => {
                    const judge = judges.find(j => j.id === judgeId);
                    if (!judge) {
                        errors.push(`Group "${group.name}" references non-existent judge`);
                    }
                });

                const groupStudents = students.filter(s => s.group_id === group.id);
                groupStudents.forEach(student => {
                    const studentExists = students.find(s => s.id === student.id);
                    if (!studentExists) {
                        errors.push(`Group "${group.name}" references non-existent student`);
                    }
                });
            }

            return errors;
        } catch (error) {
            console.error('Error validating assignments:', error);
            return [`Error validating assignments: ${error.message}`];
        }
    }
};
