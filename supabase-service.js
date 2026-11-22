/**
 * Supabase Service Module
 * Handles all database operations using Supabase client
 */

// Initialize Supabase client
let supabaseClient = null;
let supabaseClientToken = null;

/**
 * The stored login session: { token, expiresAt, userId, username, name, role }
 */
function currentSession() {
    try {
        const raw = localStorage.getItem((SUPABASE_CONFIG && SUPABASE_CONFIG.sessionKey) || 'vidyapith_session');
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

/**
 * The bearer token to send, or null when there is no usable session.
 */
function currentToken() {
    const session = currentSession();
    if (!session || !session.token) return null;
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) return null;
    return session.token;
}

/**
 * Build a client. With a token, every request carries it and Postgres decides
 * what this user may read or write; without one, only login() is callable.
 */
function createSupabaseClient(token) {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    return supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        db: {
            schema: 'public'
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false
        },
        global: {
            headers: headers
        }
    });
}

/**
 * Get Supabase client instance (rebuilt automatically when the session changes)
 */
function getSupabaseClient() {
    const token = currentToken();
    if (!supabaseClient || supabaseClientToken !== token) {
        supabaseClient = createSupabaseClient(token);
        supabaseClientToken = token;
    }
    return supabaseClient;
}

/**
 * Initialize Supabase client (kept for compatibility)
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

    supabaseClient = null;
    supabaseClientToken = null;
    return getSupabaseClient();
}

/**
 * Turn a PostgREST error into something worth showing a person.
 */
function sqlError(error, fallback) {
    if (!error) return new Error(fallback || 'Database request failed');
    const message = error.message || error.error_description || fallback || 'Database request failed';
    const err = new Error(message);
    err.code = error.code;
    err.details = error.details;
    if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
        err.message = 'You do not have permission to do that.';
    } else if (error.code === '23505') {
        err.message = 'That username already exists.';
    }
    return err;
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

    /**
     * Log in. The password is verified inside Postgres; the reply carries a
     * short-lived token that the client sends on every later request.
     * @returns {Promise<{ok: boolean, token?: string, expires_at?: string, user?: object, error?: string}>}
     */
    async login(username, password, role) {
        const client = createSupabaseClient(null);  // login itself is anonymous
        const { data, error } = await client.rpc('login', {
            p_username: username,
            p_role: role,
            p_password: password
        });
        if (error) throw sqlError(error, 'Could not reach the database');
        return data;
    },

    /**
     * Change someone's password (admin only — enforced in Postgres)
     */
    async setPassword(role, id, password) {
        const { data, error } = await getSupabaseClient().rpc('admin_set_password', {
            p_role: role,
            p_id: id,
            p_password: password
        });
        if (error) throw sqlError(error, 'Could not set the password');
        return data;
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

    async addJudge(name, username, password) {
        const { data, error } = await getSupabaseClient().rpc('admin_create_judge', {
            p_name: name,
            p_username: username,
            p_password: password
        });
        if (error) throw sqlError(error, 'Could not add the judge');
        return data;
    },

    // Create the judge, or update name/password when the username already exists
    // (used by the Excel import). Returns { judge, created }.
    async upsertJudge(name, username, password) {
        const { data, error } = await getSupabaseClient().rpc('admin_upsert_judge', {
            p_name: name,
            p_username: username,
            p_password: password || null
        });
        if (error) throw sqlError(error, 'Could not import the judge');
        return data;
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

    async addSuperJudge(name, username, password) {
        const { data, error } = await getSupabaseClient().rpc('admin_create_super_judge', {
            p_name: name,
            p_username: username,
            p_password: password
        });
        if (error) throw sqlError(error, 'Could not add the super judge');
        return data;
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

    // ==================== CRITERION GROUPS ====================
    
    async getCriterionGroups() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('criterion_groups')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching criterion groups:', error);
            throw error;
        }
    },

    async addCriterionGroup(name, isPenalty = false) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('criterion_groups')
                .insert([{ 
                    name: name.trim(),
                    is_penalty: isPenalty
                }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding criterion group:', error);
            throw error;
        }
    },

    // ==================== CRITERIA ====================
    
    async getCriteria() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('criteria')
                .select(`
                    *,
                    criterion_groups (
                        id,
                        name,
                        is_penalty
                    )
                `)
                .order('name');
            
            if (error) throw error;
            // Flatten the group data into the criterion object
            return (data || []).map(criterion => ({
                ...criterion,
                group: criterion.criterion_groups ? {
                    id: criterion.criterion_groups.id,
                    name: criterion.criterion_groups.name,
                    is_penalty: criterion.criterion_groups.is_penalty
                } : null
            }));
        } catch (error) {
            console.error('Error fetching criteria:', error);
            throw error;
        }
    },

    async addCriterion(name, groupId = null, minScore = 1, maxScore = 10) {
        try {
            const insertData = {
                name: name.trim(),
                min_score: minScore,
                max_score: maxScore
            };
            
            if (groupId) {
                insertData.group_id = groupId;
            }
            
            const { data, error } = await getSupabaseClient()
                .from('criteria')
                .insert([insertData])
                .select(`
                    *,
                    criterion_groups (
                        id,
                        name,
                        is_penalty
                    )
                `)
                .single();
            
            if (error) throw error;
            // Flatten the group data
            return {
                ...data,
                group: data.criterion_groups ? {
                    id: data.criterion_groups.id,
                    name: data.criterion_groups.name,
                    is_penalty: data.criterion_groups.is_penalty
                } : null
            };
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

    // ==================== TOPICS ====================
    
    async getTopics() {
        try {
            const { data, error } = await getSupabaseClient()
                .from('topics')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching topics:', error);
            throw error;
        }
    },

    async getTopicsByGroup(groupId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('topics')
                .select('*')
                .eq('group_id', groupId)
                .order('name');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching topics by group:', error);
            throw error;
        }
    },

    async addTopic(name, groupId, timeLimit) {
        try {
            const insertData = { 
                name: name.trim(),
                group_id: groupId
            };
            
            // Only include time_limit if provided and is a valid number
            if (timeLimit !== null && timeLimit !== undefined && timeLimit !== '') {
                const timeLimitNum = parseInt(timeLimit, 10);
                if (!isNaN(timeLimitNum) && timeLimitNum >= 0) {
                    insertData.time_limit = timeLimitNum;
                }
            }
            
            const { data, error } = await getSupabaseClient()
                .from('topics')
                .insert([insertData])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding topic:', error);
            throw error;
        }
    },

    async removeTopic(id) {
        try {
            const { error } = await getSupabaseClient()
                .from('topics')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing topic:', error);
            throw error;
        }
    },

    async updateTopic(id, name, groupId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('topics')
                .update({ 
                    name: name.trim(),
                    group_id: groupId
                })
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating topic:', error);
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
                .maybeSingle();
            
            if (error) throw error;
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
                .maybeSingle();
            
            if (error) throw error;
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
    },

    // ==================== JUDGE NOTES ====================
    
    async getNote(studentId, judgeId) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('judge_notes')
                .select('notes')
                .eq('student_id', studentId)
                .eq('judge_id', judgeId)
                .maybeSingle();
            
            if (error) throw error;
            return data ? data.notes : null;
        } catch (error) {
            console.error('Error fetching note:', error);
            throw error;
        }
    },

    async setNote(studentId, judgeId, notes) {
        try {
            const { data, error } = await getSupabaseClient()
                .from('judge_notes')
                .upsert({
                    student_id: studentId,
                    judge_id: judgeId,
                    notes: notes || null
                }, {
                    onConflict: 'student_id,judge_id'
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error setting note:', error);
            throw error;
        }
    }
};

