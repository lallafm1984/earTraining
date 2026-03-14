-- ============================================================
-- 청음 웹 플랫폼 테스트용 스키마 (로그인 없이 테스트 가능)
-- ============================================================

-- 1. Enum 타입 생성 (이미 존재하면 무시)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('teacher');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE question_type AS ENUM (
        'TYPE-01', 'TYPE-02', 'TYPE-03', 'TYPE-04', 'TYPE-05', 'TYPE-06'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. 프로필 테이블 (auth.users 참조 제거)
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'teacher',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 테스트용 프로필 생성 (고정 UUID)
INSERT INTO profiles (id, email, name, role)
VALUES ('00000000-0000-0000-0000-000000000000', 'test@example.com', '테스트 교사', 'teacher')
ON CONFLICT (id) DO NOTHING;

-- 4. 문제 테이블
CREATE TABLE IF NOT EXISTS questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  type             question_type NOT NULL,
  level            difficulty_level NOT NULL,
  grade            SMALLINT CHECK (grade BETWEEN 1 AND 3),
  bpm              SMALLINT NOT NULL DEFAULT 80,
  key_signature    TEXT,
  time_signature   TEXT,
  midi_data        JSONB,
  answer           TEXT NOT NULL,
  choices          JSONB,
  is_multiple_choice BOOLEAN NOT NULL DEFAULT TRUE,
  play_limit       SMALLINT NOT NULL DEFAULT 3,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  is_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 문제 세트 테이블
CREATE TABLE IF NOT EXISTS question_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 문제 세트 항목 테이블
CREATE TABLE IF NOT EXISTS question_set_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id       UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index  SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (set_id, question_id)
);

-- 7. 수업 세션 테이블
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  set_id      UUID REFERENCES question_sets(id) ON DELETE SET NULL,
  share_code  TEXT NOT NULL UNIQUE DEFAULT upper(substring(gen_random_uuid()::text, 1, 6)),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

-- 8. RLS 활성화 및 정책 설정 (테스트용)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (충돌 방지)
DROP POLICY IF EXISTS "anon_select_profiles" ON profiles;
DROP POLICY IF EXISTS "anon_all_questions" ON questions;
DROP POLICY IF EXISTS "anon_all_question_sets" ON question_sets;
DROP POLICY IF EXISTS "anon_all_sessions" ON sessions;

-- 테스트용 정책: 누구나 읽기/쓰기 가능 (특히 테스트 유저 데이터에 대해)
CREATE POLICY "anon_select_profiles" ON profiles FOR SELECT USING (true);

CREATE POLICY "anon_all_questions" ON questions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_question_sets" ON question_sets FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);

-- 9. updated_at 트리거 함수 (없으면 생성)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_questions_updated_at ON questions;
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_question_sets_updated_at ON question_sets;
CREATE TRIGGER trg_question_sets_updated_at BEFORE UPDATE ON question_sets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
