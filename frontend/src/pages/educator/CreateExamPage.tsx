import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import Layout from '../../components/Layout';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { ClipboardCheck, Clock, Percent, Shuffle, CheckSquare, Square, FileQuestion, Loader2, AlertCircle } from 'lucide-react';

interface Question { id: string; question_text: string; question_type: string; difficulty: string; }
interface FormData {
  title: string; instructions: string;
  time_limit_minutes: number | ''; passing_score: number | '';
  randomize_questions: boolean;
}

const typeColors: Record<string, string> = {
  multiple_choice:   'bg-blue-100 text-blue-700',
  true_or_false:     'bg-purple-100 text-purple-700',
  fill_in_the_blank: 'bg-cyan-100 text-cyan-700',
  essay:             'bg-orange-100 text-orange-700',
  matching:          'bg-pink-100 text-pink-700',
};
const typeLabel: Record<string, string> = {
  multiple_choice: 'MCQ', true_or_false: 'T/F',
  fill_in_the_blank: 'Fill', essay: 'Essay', matching: 'Match',
};
const diffColors: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

export default function CreateExamPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { register, handleSubmit, watch } = useForm<FormData>({ defaultValues: { randomize_questions: true } });
  const [selectedIDs, setSelectedIDs] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState('');

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ['questions', subjectId, 'approved'],
    queryFn: () => api.get(`/questions?subject_id=${subjectId}&approved=true`).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/exams', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams', subjectId] });
      navigate(`/educator/subjects/${subjectId}/exams`);
    },
    onError: (err: any) => setCreateError(err.response?.data?.error ?? 'Failed to create exam'),
  });

  const toggle = (id: string) =>
    setSelectedIDs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelectedIDs(selectedIDs.size === questions.length ? new Set() : new Set(questions.map(q => q.id)));

  const onSubmit = (data: FormData) => {
    setCreateError('');
    createMutation.mutate({
      subject_id: subjectId,
      title: data.title,
      instructions: data.instructions,
      time_limit_minutes: data.time_limit_minutes !== '' ? Number(data.time_limit_minutes) : null,
      passing_score: data.passing_score !== '' ? Number(data.passing_score) : null,
      randomize_questions: data.randomize_questions,
      question_ids: Array.from(selectedIDs),
    });
  };

  return (
    <Layout role="educator">
      <div className="page-header">
        <h1 className="page-title">Create Exam</h1>
        <p className="page-subtitle">Configure exam settings and select approved questions</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Settings */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <ClipboardCheck className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-semibold text-slate-800">Exam Settings</h2>
            </div>

            <div>
              <label className="label">Title <span className="text-red-400">*</span></label>
              <input className="input" placeholder="e.g. Midterm Exam" {...register('title', { required: true })} />
            </div>

            <div>
              <label className="label">Instructions</label>
              <textarea rows={3} className="input resize-none" placeholder="Instructions shown to students before the exam…" {...register('instructions')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Time Limit
                </label>
                <input type="number" min={1} className="input" {...register('time_limit_minutes')} placeholder="minutes" />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-slate-400" /> Passing Score
                </label>
                <input type="number" min={0} max={100} className="input" {...register('passing_score')} placeholder="e.g. 75" />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
              <input type="checkbox" className="w-4 h-4 accent-primary-600" {...register('randomize_questions')} />
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-primary-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Randomize order</p>
                  <p className="text-xs text-slate-400">Shuffle questions for each student</p>
                </div>
              </div>
            </label>
          </div>

          {createError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {createError}
            </div>
          )}

          <button
            type="submit"
            disabled={selectedIDs.size === 0 || createMutation.isPending}
            className="btn-primary w-full justify-center"
          >
            {createMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
              : <><ClipboardCheck className="w-4 h-4" /> Create Exam ({selectedIDs.size} questions)</>
            }
          </button>
        </div>

        {/* Question picker */}
        <div className="lg:col-span-3">
          <div className="card h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-800">Select Questions</h2>
                <p className="text-xs text-slate-400 mt-0.5">{selectedIDs.size} of {questions.length} selected</p>
              </div>
              {questions.length > 0 && (
                <button type="button" onClick={toggleAll} className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                  {selectedIDs.size === questions.length
                    ? <><CheckSquare className="w-3.5 h-3.5" /> Deselect all</>
                    : <><Square className="w-3.5 h-3.5" /> Select all</>
                  }
                </button>
              )}
            </div>

            {questions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No approved questions</p>
                <p className="text-slate-400 text-sm mt-1">Review and approve questions before creating an exam</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-[500px] pr-1">
                {questions.map((q, i) => {
                  const selected = selectedIDs.has(q.id);
                  return (
                    <label
                      key={q.id}
                      className={`flex gap-3 items-start cursor-pointer p-3 rounded-xl border transition-all duration-150
                        ${selected ? 'bg-primary-50 border-primary-200' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}
                    >
                      <input type="checkbox" checked={selected} onChange={() => toggle(q.id)} className="mt-0.5 accent-primary-600 w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          <span className="text-xs text-slate-400">#{i + 1}</span>
                          <span className={`badge text-xs ${typeColors[q.question_type] ?? 'bg-slate-100 text-slate-600'}`}>
                            {typeLabel[q.question_type] ?? q.question_type}
                          </span>
                          <span className={`badge text-xs ${diffColors[q.difficulty] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
                            {q.difficulty}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-snug">{q.question_text}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </form>
    </Layout>
  );
}
