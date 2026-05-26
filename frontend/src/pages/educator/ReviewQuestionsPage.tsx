import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import Layout from '../../components/Layout';
import { CheckCircle, Trash2, FileQuestion, Tag, Gauge } from 'lucide-react';

interface Question {
  id: string; question_text: string; question_type: string;
  difficulty: string; topic_tag: string; correct_answer: string; is_approved: boolean;
  points?: number;
}

const typeColors: Record<string, string> = {
  multiple_choice:   'bg-blue-100 text-blue-700',
  true_or_false:     'bg-purple-100 text-purple-700',
  fill_in_the_blank: 'bg-cyan-100 text-cyan-700',
  essay:             'bg-orange-100 text-orange-700',
  matching:          'bg-pink-100 text-pink-700',
};

const diffColors: Record<string, string> = {
  easy:   'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard:   'bg-red-100 text-red-700',
};

const typeLabel: Record<string, string> = {
  multiple_choice: 'MCQ', true_or_false: 'T/F',
  fill_in_the_blank: 'Fill', essay: 'Essay', matching: 'Match',
};

export default function ReviewQuestionsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const qc = useQueryClient();

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ['questions', subjectId],
    queryFn: () => api.get(`/questions?subject_id=${subjectId}`).then(r => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/questions/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', subjectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/questions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', subjectId] }),
  });

  const approved = questions.filter(q => q.is_approved).length;

  return (
    <Layout role="educator">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Review Questions</h1>
          <p className="page-subtitle">Approve or remove AI-generated questions before publishing</p>
        </div>
        {questions.length > 0 && (
          <div className="card py-2.5 px-4 flex items-center gap-3 text-sm">
            <div className="text-center">
              <p className="font-bold text-slate-900">{questions.length}</p>
              <p className="text-slate-400 text-xs">Total</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="text-center">
              <p className="font-bold text-emerald-600">{approved}</p>
              <p className="text-slate-400 text-xs">Approved</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="text-center">
              <p className="font-bold text-amber-600">{questions.length - approved}</p>
              <p className="text-slate-400 text-xs">Pending</p>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card h-28 animate-pulse bg-slate-100" />)}</div>
      ) : questions.length === 0 ? (
        <div className="card text-center py-16">
          <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No questions yet</p>
          <p className="text-slate-400 text-sm mt-1">Generate questions from the Documents page first</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id}
              className={`card transition-all duration-200 ${q.is_approved ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-xs text-slate-400 font-medium">#{i + 1}</span>
                    <span className={`badge ${typeColors[q.question_type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {typeLabel[q.question_type] ?? q.question_type}
                    </span>
                    <span className={`badge ${diffColors[q.difficulty] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
                      <Gauge className="w-3 h-3" /> {q.difficulty}
                    </span>
                    {q.topic_tag && (
                      <span className="badge bg-violet-50 text-violet-600">
                        <Tag className="w-3 h-3" /> {q.topic_tag}
                      </span>
                    )}
                    {q.points !== undefined && (
                      <span className="badge bg-primary-50 text-primary-600 font-semibold">
                        {q.points} {q.points === 1 ? 'pt' : 'pts'}
                      </span>
                    )}
                    {q.is_approved && (
                      <span className="badge bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3 h-3" /> Approved
                      </span>
                    )}
                  </div>
                  <p className="text-slate-800 text-sm font-medium leading-relaxed mb-1.5">{q.question_text}</p>
                  <p className="text-xs text-slate-400">
                    Answer: <span className="text-slate-600 font-medium">{q.correct_answer}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {!q.is_approved && (
                    <button onClick={() => approveMutation.mutate(q.id)} className="btn-success text-xs py-1.5 px-3">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  <button onClick={() => deleteMutation.mutate(q.id)} className="btn-danger text-xs py-1.5 px-3">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
