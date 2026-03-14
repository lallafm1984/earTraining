'use client'

// Client Component로 분리 → ssr: false 사용 가능
import dynamic from 'next/dynamic'
import type { QuestionType } from '@/types/database'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialNotes: any[]
}

export default function SoundPanelClient(props: Props) {
  return (
    <SoundPanel
      questionType={props.questionType}
      bpm={props.bpm}
      keySignature={props.keySignature}
      timeSignature={props.timeSignature}
      // @ts-expect-error: initialNotes prop은 SoundPanel 내부에서 처리됨
      initialNotes={props.initialNotes}
    />
  )
}
