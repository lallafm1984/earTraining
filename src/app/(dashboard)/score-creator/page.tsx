import React from 'react';
import ScoreEditor from '@/components/score/ScoreEditor';

export const metadata = {
  title: '청음 악보 제작 | Ear Training',
  description: '전문가용 청음 악보 제작 및 재생',
};

export default function ScoreCreatorPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">청음 악보 제작</h1>
        <p className="text-slate-500 mt-2">
          원하는 조표와 박자를 선택하고 음표를 입력하여 실제 악보를 만들고 재생해보세요.
        </p>
      </div>

      <ScoreEditor />
    </div>
  );
}
