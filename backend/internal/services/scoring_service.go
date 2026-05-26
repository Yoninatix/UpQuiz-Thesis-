package services

import (
	"context"
	"strings"
	"time"

	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/ccsthesis/examplatform/internal/repository"
	"github.com/google/uuid"
)

type ScoringService struct {
	attemptRepo  repository.AttemptRepository
	examRepo     repository.ExamRepository
	questionRepo repository.QuestionRepository
}

func NewScoringService(
	attemptRepo repository.AttemptRepository,
	examRepo repository.ExamRepository,
	questionRepo repository.QuestionRepository,
) *ScoringService {
	return &ScoringService{
		attemptRepo:  attemptRepo,
		examRepo:     examRepo,
		questionRepo: questionRepo,
	}
}

type ScoreResult struct {
	AttemptID   uuid.UUID `json:"attempt_id"`
	TotalScore  float64   `json:"total_score"`
	MaxScore    float64   `json:"max_score"`
	Percentage  float64   `json:"percentage"`
	SubmittedAt time.Time `json:"submitted_at"`
}

// ScoreAttempt auto-scores objective questions; skips essay.
func (s *ScoringService) ScoreAttempt(ctx context.Context, attemptID, studentID uuid.UUID) (*ScoreResult, error) {
	attempt, err := s.attemptRepo.FindByID(ctx, attemptID)
	if err != nil {
		return nil, err
	}

	// Build a question→points map from exam_questions (easy=1, medium=3, hard=5)
	examQs, err := s.examRepo.GetQuestions(ctx, attempt.ExamID)
	if err != nil {
		return nil, err
	}
	pointsMap := make(map[uuid.UUID]float64, len(examQs))
	for _, eq := range examQs {
		if eq.Points != nil {
			pointsMap[eq.ID] = *eq.Points
		} else {
			pointsMap[eq.ID] = 1.0
		}
	}

	answers, err := s.attemptRepo.GetAnswers(ctx, attemptID)
	if err != nil {
		return nil, err
	}

	var total, max float64

	for _, ans := range answers {
		q, err := s.questionRepo.FindByID(ctx, ans.QuestionID)
		if err != nil {
			continue
		}

		pts := pointsMap[ans.QuestionID]
		if pts == 0 {
			pts = 1.0
		}
		max += pts

		if q.QuestionType == models.QTypeEssay {
			// Essay: skip auto-scoring; educator marks manually
			continue
		}

		if s.checkAnswer(q, ans.AnswerText) {
			total += pts
		}
	}

	pct := 0.0
	if max > 0 {
		pct = (total / max) * 100
	}

	if err := s.attemptRepo.Submit(ctx, attemptID, total, max, pct); err != nil {
		return nil, err
	}

	return &ScoreResult{
		AttemptID:   attemptID,
		TotalScore:  total,
		MaxScore:    max,
		Percentage:  pct,
		SubmittedAt: time.Now(),
	}, nil
}

func (s *ScoringService) checkAnswer(q *models.GeneratedQuestion, studentAnswer string) bool {
	correct := strings.TrimSpace(strings.ToLower(q.CorrectAnswer))
	given := strings.TrimSpace(strings.ToLower(studentAnswer))

	switch q.QuestionType {
	case models.QTypeMultipleChoice, models.QTypeTrueOrFalse:
		return correct == given
	case models.QTypeFillBlank:
		return correct == given
	case models.QTypeMatching:
		// Matching answers submitted as JSON string; exact-match for now
		return correct == given
	default:
		return false
	}
}
