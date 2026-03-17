import React from 'react';
import ScoreEditor from '@/components/score/ScoreEditor';

export const metadata = {
  title: '악보 제작',
  description: '청음 악보 제작 및 재생',
};

export default function ScoreCreatorPage() {
  return (
    <div className="h-full">
      <ScoreEditor />
    </div>
  );
}
