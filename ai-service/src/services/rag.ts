import { embedText } from './embeddings';
import { searchSimilarChunks, SearchResult } from './milvus';
import { generate } from './ollama';

export type QuestionType = 'multiple_choice' | 'true_or_false' | 'fill_in_the_blank' | 'essay' | 'matching';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestionConfig {
  type: QuestionType;
  difficulty: Difficulty;
  count: number;
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  topic_tag: string;
  correct_answer: string;
  choices?: Record<string, string>[] | null;
  document_id: string;
  source_chunk_uuid: string;
  source_content: string;
}

const MIN_CHUNK_SCORE = 0.35; // cosine similarity threshold

/**
 * Full RAG pipeline:
 * 1. Embed the subject/topic query
 * 2. Retrieve relevant chunks from Milvus
 * 3. Build a source-grounded prompt
 * 4. Call Ollama/Gemma
 * 5. Parse and return structured questions
 */
export async function generateQuestionsFromRAG(
  subjectId: string,
  topicHint: string,
  configs: QuestionConfig[],
): Promise<GeneratedQuestion[]> {
  // 1. Embed the topic hint to find relevant chunks
  const queryEmbedding = await embedText(topicHint);

  const totalQuestions = configs.reduce((sum, c) => sum + c.count, 0);
  const chunks = await searchSimilarChunks(queryEmbedding, subjectId, Math.max(totalQuestions * 2, 10));

  const relevantChunks = chunks.filter(c => c.score >= MIN_CHUNK_SCORE);

  if (chunks.length === 0) {
    throw new Error(
      'No document chunks found in the vector database for this subject. ' +
      'Make sure your documents have been processed successfully (status must be "Ready" in Learning Materials). ' +
      'If documents show "Failed", the nomic-embed-text embedding model may not be loaded in Ollama.',
    );
  }

  if (relevantChunks.length === 0) {
    throw new Error(
      `No document content is relevant enough to the topic "${topicHint}". ` +
      'Try a more specific topic that matches the content of your uploaded documents, ' +
      'or upload additional materials covering this topic.',
    );
  }

  const questions: GeneratedQuestion[] = [];
  const alreadyGenerated: string[] = [];

  for (const cfg of configs) {
    let generated = 0;
    let totalAttempts = 0;
    const maxAttempts = cfg.count * 6; // up to 6x overhead before giving up

    while (generated < cfg.count && totalAttempts < maxAttempts) {
      totalAttempts++;
      const chunk = relevantChunks[(questions.length + totalAttempts) % relevantChunks.length];
      // Cycle temperature 0.2 → 0.6 across retries to escape repeated outputs
      const temperature = 0.2 + (totalAttempts % 5) * 0.1;

      let rawOutput: string;
      try {
        rawOutput = await generate({ prompt: buildPrompt(cfg, chunk, topicHint), temperature });
      } catch (err) {
        console.error(`Ollama error (attempt ${totalAttempts}):`, err);
        if (totalAttempts >= maxAttempts) throw new Error('LLM generation failed. Is Ollama running with gemma loaded?');
        continue;
      }

      const parsed = parseQuestions(rawOutput, cfg, chunk).filter(q => {
        const norm = q.question_text.trim().toLowerCase().slice(0, 80);
        return !alreadyGenerated.some(e => e.trim().toLowerCase().slice(0, 80) === norm);
      });

      if (parsed.length > 0) {
        questions.push(parsed[0]);
        alreadyGenerated.push(parsed[0].question_text);
        generated++;
      } else {
        console.warn(`Attempt ${totalAttempts}: no unique question for type=${cfg.type} difficulty=${cfg.difficulty}, retrying…`);
      }
    }

    if (generated < cfg.count) {
      console.warn(`Generated ${generated}/${cfg.count} for type=${cfg.type} difficulty=${cfg.difficulty} after ${totalAttempts} attempts`);
    }
  }

  return questions;
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildPrompt(cfg: QuestionConfig, chunk: SearchResult, topic: string): string {
  const typeInstructions: Record<QuestionType, string> = {
    multiple_choice: `Generate 1 multiple choice question. It must have exactly 4 choices labeled A, B, C, D. State the correct letter as the answer.`,
    true_or_false: `Generate 1 true or false question. Answer must be exactly "True" or "False".`,
    fill_in_the_blank: `Generate 1 fill-in-the-blank question. Use ___ for the blank. Provide the exact word or phrase as the answer.`,
    essay: `Generate 1 essay question. Provide a model answer of 2-3 sentences.`,
    matching: `Generate 1 matching type question with 4 pairs. Format as JSON with "left" and "right" keys per pair.`,
  };

  return `You are an exam question generator. Use ONLY facts from the source text below. The question MUST be about the topic: "${topic}".

SOURCE TEXT:
"""
${chunk.content}
"""

TOPIC: ${topic}
DIFFICULTY: ${cfg.difficulty}
TASK: ${typeInstructions[cfg.type]}

IMPORTANT: Your entire response must be a single valid JSON array (starting with [ and ending with ]).
Each element of the array is an object with EXACTLY these keys:
  "question_text": the question as a string
  "question_type": "${cfg.type}"
  "difficulty": "${cfg.difficulty}"
  "topic_tag": a short label (1-4 words)
  "correct_answer": the answer as a string
  "choices": for multiple_choice use [{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}], for matching use [{"left":"...","right":"..."},...], for all others use null

Example of the required format:
[{"question_text":"...","question_type":"${cfg.type}","difficulty":"${cfg.difficulty}","topic_tag":"...","correct_answer":"...","choices":null}]

Do NOT include any text outside the JSON array. No markdown, no code fences, no explanations.`;
}

// ─── Choice normaliser ────────────────────────────────────────────────────────

function normalizeChoices(raw: any, type: QuestionType): Record<string, string>[] | null {
  if (type !== 'multiple_choice' || !raw) return raw ?? null;
  if (!Array.isArray(raw)) return null;

  return raw.map((item: any, i: number) => {
    const fallbackKey = String.fromCharCode(65 + i); // A, B, C, D
    if (item && typeof item === 'object' && typeof item.text === 'string') {
      // Already {key, text} or just {text} — ensure key exists
      return { key: item.key || fallbackKey, text: item.text };
    }
    // LLM returned {"A": "some text"} style
    const entries = Object.entries(item ?? {});
    if (entries.length > 0) {
      const [k, v] = entries[0];
      return { key: k || fallbackKey, text: String(v) };
    }
    return { key: fallbackKey, text: String(item ?? '') };
  });
}

// ─── Response parser ──────────────────────────────────────────────────────────

function extractJSON(raw: string): any {
  // Strip markdown fences
  let text = raw.replace(/```json|```/g, '').trim();

  // Try direct parse first
  try { return JSON.parse(text); } catch { /* fall through */ }

  // Find the outermost [...] or {...} block and try again
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch { /* fall through */ }
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }

  console.warn('No parseable JSON in LLM response:', text.slice(0, 300));
  return null;
}

function parseQuestions(
  raw: string,
  cfg: QuestionConfig,
  chunk: SearchResult,
): GeneratedQuestion[] {
  const parsed = extractJSON(raw);
  if (parsed === null) return [];

  // Gemma sometimes returns a single object instead of an array — normalise it
  const items: any[] = Array.isArray(parsed)
    ? parsed
    : (parsed.question_text ? [parsed] : []);

  return items
    .filter(q => typeof q.question_text === 'string' && q.question_text.trim().length > 0)
    .slice(0, cfg.count)
    .map(q => ({
      question_text: q.question_text,
      question_type: cfg.type,
      difficulty: cfg.difficulty,
      topic_tag: q.topic_tag ?? cfg.type,
      correct_answer: String(q.correct_answer ?? ''),
      choices: normalizeChoices(q.choices, cfg.type),
      document_id: chunk.document_id,
      source_chunk_uuid: chunk.chunk_uuid,
      source_content: chunk.content,
    }));
}
