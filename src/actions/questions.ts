'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { QuestionType, DifficultyLevel } from '@/types/database'

export async function createQuestion(formData: FormData) {
  const supabase = await createClient()
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // if (!user) return { error: '인증이 필요합니다.' }
  const user = { id: '00000000-0000-0000-0000-000000000000' } // 테스트용 임시 사용자 ID (UUID)

  const title = formData.get('title') as string
  const type = formData.get('type') as QuestionType
  const level = formData.get('level') as DifficultyLevel
  const grade = formData.get('grade') ? Number(formData.get('grade')) : null
  const bpm = Number(formData.get('bpm') ?? 80)
  const key_signature = (formData.get('key_signature') as string) || null
  const time_signature = (formData.get('time_signature') as string) || null
  const answer = formData.get('answer') as string
  const is_multiple_choice = formData.get('is_multiple_choice') === 'true'
  const play_limit = Number(formData.get('play_limit') ?? 3)
  const tagsRaw = (formData.get('tags') as string) || ''
  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  // MIDI 데이터 처리
  const midiDataRaw = formData.get('midi_data') as string
  let midi_data = null
  if (midiDataRaw) {
    try {
      midi_data = JSON.parse(midiDataRaw)
    } catch {
      // ignore
    }
  }

  // 객관식 보기 처리
  let choices = null
  if (is_multiple_choice) {
    const choicesRaw = formData.get('choices') as string
    if (choicesRaw) {
      choices = choicesRaw
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
    }
  }

  if (!title || !type || !level || !answer) {
    return { error: '필수 항목을 모두 입력해주세요.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('questions').insert({
    teacher_id: user.id,
    title,
    type,
    level,
    grade,
    bpm,
    key_signature,
    time_signature,
    midi_data,
    answer,
    choices,
    is_multiple_choice,
    play_limit,
    tags,
  })

  if (error) return { error: error.message }

  revalidatePath('/questions')
  redirect('/questions')
}

export async function deleteQuestion(id: string): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('questions').delete().eq('id', id)
  if (error) {
    console.error('deleteQuestion error:', error.message)
    return
  }
  revalidatePath('/questions')
  revalidatePath('/dashboard')
}

export async function toggleLockQuestion(id: string, is_locked: boolean): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('questions')
    .update({ is_locked: !is_locked })
    .eq('id', id)
  if (error) {
    console.error('toggleLockQuestion error:', error.message)
    return
  }
  revalidatePath('/questions')
}
