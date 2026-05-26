import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import Layout from '../../components/Layout';
import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Save, Send, Loader2, BookOpen } from 'lucide-react';

interface Question {
  id: string; question_text: string; question_type: string;
  choices?: { key: string; text: string }[] | null;
  points?: number;
}
interface Attempt { id: string; status: string; }

export default function TakeExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: attempt } = useQuery<Attempt>({
    queryKey: ['attempt', examId],
    queryFn: () => api.post(`/exams/${examId}/attempt`).then(r => r.data),
  });

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ['exam-questions', examId],
    queryFn: () => api.get(`/exams/${examId}/questions`).then(r => r.data),
    enabled: !!attempt,
  });

  useEffect(() => {
    if (!attempt || Object.keys(answers).length === 0) return;
    const id = setInterval(() => saveAnswers(), 30_000);
    return () => clearInterval(id);
  }, [attempt, answers]);

  const saveAnswers = async () => {
    if (!attempt) return;
    await api.post(`/attempts/${attempt.id}/answers`, {
      answers: Object.entries(answers).map(([question_id, answer_text]) => ({ question_id, answer_text })),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveAnswers();
      return api.post(`/attempts/${attempt!.id}/submit`);
    },
    onSuccess: (res) => navigate(`/student/results/${res.data.attempt_id}`),
  });

  const setAnswer = (qId: string, value: string) =>
    setAnswers(prev => ({ ...prev, [qId]: value }));

  const answeredCount = Object.values(answers).filter(a => a.trim()).length;
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  if (isLoading) {
    return (
      <Layout role="student">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-slate-100" />)}
        </div>
      </Layout>
    );
  }

  return (
    <Layout role="student">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 bg-white/80 backdrop-blur-sm border-b border-slate-100 mb-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-semibold text-slate-700">
                {answeredCount} / {questions.length} answered
              </span>
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-xs text-emerald-600 flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5" /> Auto-saves every 30s
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-4 mb-8">
        {questions.map((q, i) => {
          const answered = !!(answers[q.id]?.trim());
          return (
            <div
              key={q.id}
              className={`card transition-all duration-200 ${answered ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-slate-200'}`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5
                  ${answered ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {answered ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-800 leading-relaxed">{q.question_text}</p>
                  {q.points !== undefined && (
                    <span className="inline-block mt-1 text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                      {q.points} {q.points === 1 ? 'pt' : 'pts'}
                    </span>
                  )}
                </div>
              </div>

              {q.question_type === 'multiple_choice' && Array.isArray(q.choices) && q.choices.length > 0 && (
                <div className="space-y-2 ml-10">
                  {q.choices.map((c: any, ci) => {
                    // Always derive key from index so duplicates/malformed data never break selection
                    const choiceKey = String.fromCharCode(65 + ci);
                    // Handle various LLM output shapes: {key,text}, {text}, plain string, {"A":"text"}
                    const choiceText = typeof c === 'string'
                      ? c
                      : c?.text ?? c?.value ?? (Object.values(c ?? {}).find((v: any) => typeof v === 'string') as string) ?? '';
                    const selected = answers[q.id] === choiceKey;
                    return (
                      <label
                        key={choiceKey}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all duration-150
                          ${selected ? 'bg-primary-50 border-primary-300' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                          ${selected ? 'border-primary-500 bg-primary-500' : 'border-slate-300'}`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <input
                          type="radio" name={q.id} value={choiceKey}
                          checked={selected} onChange={() => setAnswer(q.id, choiceKey)}
                          className="sr-only"
                        />
                        <span className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-500 mr-1">{choiceKey}.</span> {choiceText}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {q.question_type === 'true_or_false' && (
                <div className="flex gap-3 ml-10">
                  {['True', 'False'].map(v => {
                    const selected = answers[q.id] === v;
                    return (
                      <label
                        key={v}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl cursor-pointer border transition-all duration-150 font-medium text-sm
                          ${selected ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-slate-50 border-transparent hover:bg-slate-100 text-slate-600'}`}
                      >
                        <input
                          type="radio" name={q.id} value={v}
                          checked={selected} onChange={() => setAnswer(q.id, v)}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
                          ${selected ? 'border-primary-500 bg-primary-500' : 'border-slate-300'}`}>
                          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        {v}
                      </label>
                    );
                  })}
                </div>
              )}

              {(q.question_type === 'fill_in_the_blank' || q.question_type === 'essay') && (
                <div className="ml-10">
                  <textarea
                    rows={q.question_type === 'essay' ? 5 : 2}
                    className="input resize-none"
                    placeholder={q.question_type === 'essay' ? 'Write your response here…' : 'Type your answer…'}
                    value={answers[q.id] ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                  />
                </div>
              )}

              {q.question_type === 'matching' && (
                <div className="ml-10">
                  <textarea
                    rows={3}
                    className="input resize-none"
                    placeholder="e.g. 1-A, 2-C, 3-B…"
                    value={answers[q.id] ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Enter your matching pairs, separated by commas</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit bar */}
      <div className="max-w-3xl mx-auto">
        <div className="card flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">{answeredCount} of {questions.length} questions answered</p>
            {answeredCount < questions.length && (
              <p className="text-xs text-amber-600 mt-0.5">{questions.length - answeredCount} unanswered — you can still submit</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => saveAnswers()}
              className="btn-secondary text-sm"
            >
              <Save className="w-4 h-4" /> Save Progress
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="btn-primary text-sm"
            >
              {submitMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                : <><Send className="w-4 h-4" /> Submit Exam</>
              }
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
