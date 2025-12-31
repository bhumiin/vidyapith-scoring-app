/**
 * Supabase Service Module
 * Handles all database operations using Supabase client
 */

// Initialize Supabase client
let supabaseClient = null;

/**
 * Initialize Supabase client
 */
function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('Supabase client library not loaded. Please include the Supabase script in your HTML.');
        return null;
    }
    
    if (!SUPABASE_CONFIG || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
        console.error('Supabase configuration missing. Please set SUPABASE_CONFIG in supabase-config.js');
        return null;
    }
    
    if (SUPABASE_CONFIG.url === 'YOUR_SUPABASE_PROJECT_URL' || SUPABASE_CONFIG.anonKey === 'YOUR_SUPABASE_ANON_KEY') {
        console.error('Please configure your Supabase credentials in supabase-config.js');
        return null;
    }
    
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        db: {
            schema: 'public'
        },
        auth: {
            persistSession: false
        },
        global: {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        }
    });
    return supabaseClient;
}

/**
 * Get Supabase client instance
 */
function getSupabaseClient() {
    if (!supabaseClient) {
        initSupabase();
    }
    return supabaseClient;
}

const SupabaseService = {
    /**
     * Initialize the service
     */
    async init() {
        const client = initSupabase();
        if (!client) {
            throw new Error('Failed to initialize Supabase client');
        }
        return client;
    },

    // ==================== STUDENTS ====================
    
    async getStudents() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('students')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching students:', error);
            throw error;
        }
    },

    async addStudent(name) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('students')
                .insert([{ name: name.trim() }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding student:', error);
            throw error;
        }
    },

    async removeStudent(id) {
        try {
            const { error } = await getSupabaseClient()
                .from('students')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing student:', error);
            throw error;
        }
    },

    async updateStudentGroup(studentId, groupId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('students')
                .update({ group_id: groupId })
                .eq('id', studentId)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating student group:', error);
            throw error;
        }
    },

    // ==================== JUDGES ====================
    
    async getJudges() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('judges')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching judges:', error);
            throw error;
        }
    },

    async addJudge(name, username, passwordHash) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('judges')
                .insert([{
                    name: name.trim(),
                    username: username.trim(),
                    password_hash: passwordHash
                }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding judge:', error);
            throw error;
        }
    },

    async removeJudge(id) {
        try {
            const { error } = await getSupabaseClient()
                .from('judges')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing judge:', error);
            throw error;
        }
    },

    async getJudgeByUsername(username) {
        try {
            // First try the direct query approach
            const { data, error } = await getSupabaseClient()
                .from('judges')
                .select('*')
                .eq('username', username)
                .limit(1);
            
            if (error) {
                // Handle 406 Not Acceptable error or other errors
                if (error.status === 406 || error.code === 'PGRST301') {
                    console.warn('406 error when querying judge, using fallback approach');
                    // Fallback: get all judges and filter client-side
                    const allJudges = await this.getJudges();
                    return allJudges.find(j => j.username === username) || null;
                }
                throw error;
            }
            
            // Return first match or null
            return data && data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error('Error fetching judge by username:', error);
            // Fallback: try getting all judges and filtering
            try {
                const allJudges = await this.getJudges();
                return allJudges.find(j => j.username === username) || null;
            } catch (fallbackError) {
                console.error('Fallback query also failed:', fallbackError);
                throw error; // Throw original error
            }
        }
    },

    async updateJudge(id, name, username, passwordHash) {
        try {
            const updateData = {
                name: name.trim(),
                username: username.trim()
            };
            
            // Only update password if provided
            if (passwordHash) {
                updateData.password_hash = passwordHash;
            }
            
            const { data, error } = await getSupabaseClient()
                .from('judges')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating judge:', error);
            throw error;
        }
    },

    // ==================== SUPER JUDGES ====================
    
    async getSuperJudges() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('super_judges')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching super judges:', error);
            throw error;
        }
    },

    async addSuperJudge(name, username, passwordHash) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('super_judges')
                .insert([{
                    name: name.trim(),
                    username: username.trim(),
                    password_hash: passwordHash
                }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding super judge:', error);
            throw error;
        }
    },

    async removeSuperJudge(id) {
        try {
            const { error } = await getSupabaseClient()
                .from('super_judges')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing super judge:', error);
            throw error;
        }
    },

    async getSuperJudgeByUsername(username) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('super_judges')
                .select('*')
                .eq('username', username)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            return data || null;
        } catch (error) {
            console.error('Error fetching super judge by username:', error);
            throw error;
        }
    },

    // ==================== ADMIN USERS ====================
    
    async getAdminByUsername(username) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('admin_users')
                .select('*')
                .eq('username', username)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            return data || null;
        } catch (error) {
            console.error('Error fetching admin by username:', error);
            throw error;
        }
    },

    // ==================== GROUPS ====================
    
    async getGroups() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('groups')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching groups:', error);
            throw error;
        }
    },

    async addGroup(name) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('groups')
                .insert([{ name: name.trim() }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding group:', error);
            throw error;
        }
    },

    async removeGroup(id) {
        try {
            const { error } = await getSupabaseClient()
                .from('groups')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing group:', error);
            throw error;
        }
    },

    // ==================== GROUP JUDGES (Junction Table) ====================
    
    async getGroupJudges(groupId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('group_judges')
                .select('judge_id')
                .eq('group_id', groupId);
            
            if (error) throw error;
            return data.map(item => item.judge_id);
        } catch (error) {
            console.error('Error fetching group judges:', error);
            throw error;
        }
    },

    async assignJudgeToGroup(judgeId, groupId) {
        try {
            const { error } = await getSupabaseClient()
                .from('group_judges')
                .insert([{ judge_id: judgeId, group_id: groupId }])
                .select();
            
            if (error && error.code !== '23505') throw error; // 23505 = unique violation (already exists)
            return true;
        } catch (error) {
            console.error('Error assigning judge to group:', error);
            throw error;
        }
    },

    async removeJudgeFromGroup(judgeId, groupId) {
        try {
            const { error } = await getSupabaseClient()
                .from('group_judges')
                .delete()
                .eq('judge_id', judgeId)
                .eq('group_id', groupId);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing judge from group:', error);
            throw error;
        }
    },

    async getJudgeGroups(judgeId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('group_judges')
                .select('group_id')
                .eq('judge_id', judgeId);
            
            if (error) throw error;
            return data.map(item => item.group_id);
        } catch (error) {
            console.error('Error fetching judge groups:', error);
            throw error;
        }
    },

    // ==================== CRITERIA ====================
    
    async getCriteria() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('criteria')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching criteria:', error);
            throw error;
        }
    },

    async addCriterion(name) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('criteria')
                .insert([{ name: name.trim() }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding criterion:', error);
            throw error;
        }
    },

    async removeCriterion(id) {
        try {
            const { error } = await getSupabaseClient()
                .from('criteria')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing criterion:', error);
            throw error;
        }
    },

    // ==================== SCORES ====================
    
    async getScore(studentId, judgeId, criterionId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('scores')
                .select('score')
                .eq('student_id', studentId)
                .eq('judge_id', judgeId)
                .eq('criterion_id', criterionId)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            return data ? data.score : null;
        } catch (error) {
            console.error('Error fetching score:', error);
            throw error;
        }
    },

    async setScore(studentId, judgeId, criterionId, score) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('scores')
                .upsert({
                    student_id: studentId,
                    judge_id: judgeId,
                    criterion_id: criterionId,
                    score: score
                }, {
                    onConflict: 'student_id,judge_id,criterion_id'
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error setting score:', error);
            throw error;
        }
    },

    async getAllScores() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('scores')
                .select('*');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching all scores:', error);
            throw error;
        }
    },

    async getScoresForStudent(studentId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('scores')
                .select('*')
                .eq('student_id', studentId);
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching scores for student:', error);
            throw error;
        }
    },

    // ==================== SUBMISSIONS ====================
    
    async isSubmitted(studentId, judgeId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('submissions')
                .select('id')
                .eq('student_id', studentId)
                .eq('judge_id', judgeId)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        } catch (error) {
            console.error('Error checking submission:', error);
            throw error;
        }
    },

    async submitScores(studentId, judgeId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('submissions')
                .upsert({
                    student_id: studentId,
                    judge_id: judgeId
                }, {
                    onConflict: 'student_id,judge_id'
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error submitting scores:', error);
            throw error;
        }
    },

    async unlockScores(studentId, judgeId) {
        try {
            const { error } = await getSupabaseClient()
                .from('submissions')
                .delete()
                .eq('student_id', studentId)
                .eq('judge_id', judgeId);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error unlocking scores:', error);
            throw error;
        }
    },

    async getAllSubmissions() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('submissions')
                .select('*');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching all submissions:', error);
            throw error;
        }
    }
};

