-- Vidyapith Scoring App Database Schema
-- Run this script in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create judges table
CREATE TABLE IF NOT EXISTS judges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create super_judges table
CREATE TABLE IF NOT EXISTS super_judges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create students table
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create group_judges junction table (many-to-many)
CREATE TABLE IF NOT EXISTS group_judges (
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    judge_id UUID NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, judge_id)
);

-- Create criteria table
CREATE TABLE IF NOT EXISTS criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create topics table
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    time_limit INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create scores table
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    judge_id UUID NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
    criterion_id UUID NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, judge_id, criterion_id)
);

-- Create submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    judge_id UUID NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, judge_id)
);

-- Create judge_notes table
CREATE TABLE IF NOT EXISTS judge_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    judge_id UUID NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, judge_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_students_group_id ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_group_judges_group_id ON group_judges(group_id);
CREATE INDEX IF NOT EXISTS idx_group_judges_judge_id ON group_judges(judge_id);
CREATE INDEX IF NOT EXISTS idx_scores_student_id ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_judge_id ON scores(judge_id);
CREATE INDEX IF NOT EXISTS idx_scores_criterion_id ON scores(criterion_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_judge_id ON submissions(judge_id);
CREATE INDEX IF NOT EXISTS idx_topics_group_id ON topics(group_id);
CREATE INDEX IF NOT EXISTS idx_judge_notes_student_id ON judge_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_judge_notes_judge_id ON judge_notes(judge_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for scores table
CREATE TRIGGER update_scores_updated_at BEFORE UPDATE ON scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for judge_notes table
CREATE TRIGGER update_judge_notes_updated_at BEFORE UPDATE ON judge_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for public read/write access (adjust based on your security needs)
-- For now, allowing all operations. In production, you should restrict based on user roles.

-- Admin users policies
CREATE POLICY "Allow all operations on admin_users" ON admin_users
    FOR ALL USING (true) WITH CHECK (true);

-- Judges policies
CREATE POLICY "Allow all operations on judges" ON judges
    FOR ALL USING (true) WITH CHECK (true);

-- Super judges policies
CREATE POLICY "Allow all operations on super_judges" ON super_judges
    FOR ALL USING (true) WITH CHECK (true);

-- Groups policies
CREATE POLICY "Allow all operations on groups" ON groups
    FOR ALL USING (true) WITH CHECK (true);

-- Students policies
CREATE POLICY "Allow all operations on students" ON students
    FOR ALL USING (true) WITH CHECK (true);

-- Group judges policies
CREATE POLICY "Allow all operations on group_judges" ON group_judges
    FOR ALL USING (true) WITH CHECK (true);

-- Criteria policies
CREATE POLICY "Allow all operations on criteria" ON criteria
    FOR ALL USING (true) WITH CHECK (true);

-- Topics policies
CREATE POLICY "Allow all operations on topics" ON topics
    FOR ALL USING (true) WITH CHECK (true);

-- Scores policies
CREATE POLICY "Allow all operations on scores" ON scores
    FOR ALL USING (true) WITH CHECK (true);

-- Submissions policies
CREATE POLICY "Allow all operations on submissions" ON submissions
    FOR ALL USING (true) WITH CHECK (true);

-- Judge notes policies
CREATE POLICY "Allow all operations on judge_notes" ON judge_notes
    FOR ALL USING (true) WITH CHECK (true);

-- Insert default admin user (password: admin)
-- Password hash for "admin" using bcrypt (you should change this!)
-- This is a placeholder - you'll need to generate a proper bcrypt hash
-- You can use: https://bcrypt-generator.com/ or generate it in your app
-- For now, we'll insert a placeholder that you should update
INSERT INTO admin_users (username, password_hash) 
VALUES ('admin', '$2a$10$placeholder_change_this_hash') 
ON CONFLICT (username) DO NOTHING;

