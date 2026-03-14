-- ============================================================
-- 청음 웹 플랫폼 초기 스키마
-- Phase 1: 교사 전용 시스템
-- ============================================================

-- 사용자 역할 enum
CREATE TYPE user_role AS ENUM ('teacher');

-- 문제 유형 enum
CREATE TYPE question_type AS ENUM (
  'TYPE-01', -- 단음 식별
  'TYPE-02', -- 음정 식별
  'TYPE-03', -- 화음 식별
  'TYPE-04', -- 리듬 받아쓰기
  'TYPE-05', -- 선율 받아쓰기
  'TYPE-06'  -- 조성 식별
);

-- 난이도 enum
CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');

-- ============================================================
-- 프로필 테이블 (Supabase Auth users 와 연동)
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'teacher',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 문제 테이블
-- ============================================================
CREATE TABLE questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  type             question_type NOT NULL,
  level            difficulty_level NOT NULL,
  grade            SMALLINT CHECK (grade BETWEEN 1 AND 3),
  bpm              SMALLINT NOT NULL DEFAULT 80,
  key_signature    TEXT,         -- 예: 'C', 'G', 'F#m'
  time_signature   TEXT,         -- 예: '4/4', '3/4'
  midi_data        JSONB,        -- 음표 데이터 배열
  answer           TEXT NOT NULL,
  choices          JSONB,        -- 객관식 보기 배열
  is_multiple_choice BOOLEAN NOT NULL DEFAULT TRUE,
  play_limit       SMALLINT NOT NULL DEFAULT 3,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  is_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 문제 세트 테이블
-- ============================================================
CREATE TABLE question_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 문제 세트 항목 테이블
-- ============================================================
CREATE TABLE question_set_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id       UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index  SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (set_id, question_id)
);

-- ============================================================
-- 수업 세션 테이블
-- ============================================================
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  set_id      UUID REFERENCES question_sets(id) ON DELETE SET NULL,
  share_code  TEXT NOT NULL UNIQUE DEFAULT upper(substring(gen_random_uuid()::text, 1, 6)),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX idx_questions_teacher_id ON questions(teacher_id);
CREATE INDEX idx_questions_type ON questions(type);
CREATE INDEX idx_questions_level ON questions(level);
CREATE INDEX idx_questions_created_at ON questions(created_at DESC);
CREATE INDEX idx_question_sets_teacher_id ON question_sets(teacher_id);
CREATE INDEX idx_sessions_teacher_id ON sessions(teacher_id);
CREATE INDEX idx_sessions_share_code ON sessions(share_code);

-- ============================================================
-- updated_at 자동 업데이트 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_question_sets_updated_at
  BEFORE UPDATE ON question_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- profiles: 본인만 읽기/수정
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- questions: 교사 본인만 전체 권한
CREATE POLICY "questions_teacher_all" ON questions
  FOR ALL USING (auth.uid() = teacher_id);

-- question_sets: 교사 본인만 전체 권한
CREATE POLICY "question_sets_teacher_all" ON question_sets
  FOR ALL USING (auth.uid() = teacher_id);

-- question_set_items: 세트 소유자만 전체 권한
CREATE POLICY "question_set_items_teacher_all" ON question_set_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM question_sets
      WHERE id = question_set_items.set_id
        AND teacher_id = auth.uid()
    )
  );

-- sessions: 교사 본인만 전체 권한
CREATE POLICY "sessions_teacher_all" ON sessions
  FOR ALL USING (auth.uid() = teacher_id);

-- ============================================================
-- 신규 가입 시 profiles 자동 생성 함수
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'teacher'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
