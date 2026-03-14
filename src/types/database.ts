export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type QuestionType =
  | 'TYPE-01'
  | 'TYPE-02'
  | 'TYPE-03'
  | 'TYPE-04'
  | 'TYPE-05'
  | 'TYPE-06'

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'

export type UserRole = 'teacher'

// Supabase DB Row 타입들
export interface ProfileRow {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface QuestionRow {
  id: string
  teacher_id: string
  title: string
  type: QuestionType
  level: DifficultyLevel
  grade: number | null
  bpm: number
  key_signature: string | null
  time_signature: string | null
  midi_data: Json | null
  answer: string
  choices: Json | null
  is_multiple_choice: boolean
  play_limit: number
  tags: string[]
  is_locked: boolean
  created_at: string
  updated_at: string
}

export interface QuestionSetRow {
  id: string
  teacher_id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface QuestionSetItemRow {
  id: string
  set_id: string
  question_id: string
  order_index: number
}

export interface SessionRow {
  id: string
  teacher_id: string
  title: string
  set_id: string | null
  share_code: string
  is_active: boolean
  created_at: string
  ended_at: string | null
}

// Supabase createBrowserClient / createServerClient 제네릭용 Database 타입
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Partial<ProfileRow> & { id: string; email: string; name: string }
        Update: Partial<ProfileRow>
        Relationships: []
      }
      questions: {
        Row: QuestionRow
        Insert: Omit<QuestionRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<QuestionRow>
        Relationships: []
      }
      question_sets: {
        Row: QuestionSetRow
        Insert: Omit<QuestionSetRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<QuestionSetRow>
        Relationships: []
      }
      question_set_items: {
        Row: QuestionSetItemRow
        Insert: Omit<QuestionSetItemRow, 'id'> & { id?: string }
        Update: Partial<QuestionSetItemRow>
        Relationships: []
      }
      sessions: {
        Row: SessionRow
        Insert: Omit<SessionRow, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<SessionRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      question_type: QuestionType
      difficulty_level: DifficultyLevel
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}
