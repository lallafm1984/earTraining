'use client'

// Client Component로 분리 → ssr: false 사용 가능
import dynamic from 'next/dynamic'
import type { QuestionType } from '@/types/database'
import type { NoteEvent } from '@/components/sound/useSoundPlayer'

const SoundPanel = dynamic(() => import('@/components/sound/SoundPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
      사운드 엔진 로딩 중...
    </div>
  ),
})

interface Props {
  questionType: QuestionType
  bpm: number
  keySignature: string
  timeSignature: string
  initialNotes: NoteEvent[]
}

export default function SoundPanelClient(props: Props) {
  return (
    <SoundPanel
      questionType={props.questionType}
      bpm={props.bpm}
      keySignature={props.keySignature}
      timeSignature={props.timeSignature}
      initialNotes={props.initialNotes}
    />
  )
}
