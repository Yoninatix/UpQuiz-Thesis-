package models

import (
	"time"

	"github.com/google/uuid"
)

// ─── Enums ────────────────────────────────────────────────────────────────────

type UserRole string

const (
	RoleAdmin    UserRole = "admin"
	RoleEducator UserRole = "educator"
	RoleStudent  UserRole = "student"
)

type QuestionType string

const (
	QTypeMultipleChoice  QuestionType = "multiple_choice"
	QTypeTrueOrFalse     QuestionType = "true_or_false"
	QTypeFillBlank       QuestionType = "fill_in_the_blank"
	QTypeEssay           QuestionType = "essay"
	QTypeMatching        QuestionType = "matching"
)

type DifficultyLevel string

const (
	DiffEasy   DifficultyLevel = "easy"
	DiffMedium DifficultyLevel = "medium"
	DiffHard   DifficultyLevel = "hard"
)

type ExamStatus string

const (
	ExamDraft     ExamStatus = "draft"
	ExamPublished ExamStatus = "published"
	ExamClosed    ExamStatus = "closed"
)

type AttemptStatus string

const (
	AttemptInProgress AttemptStatus = "in_progress"
	AttemptSubmitted  AttemptStatus = "submitted"
	AttemptScored     AttemptStatus = "scored"
)

// ─── Structs ──────────────────────────────────────────────────────────────────

type User struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Password  string    `json:"-"` // never expose
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Role      UserRole  `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Subject struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	EducatorID  uuid.UUID `json:"educator_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UploadedDocument struct {
	ID            uuid.UUID `json:"id"`
	SubjectID     uuid.UUID `json:"subject_id"`
	UploadedBy    uuid.UUID `json:"uploaded_by"`
	OriginalName  string    `json:"original_name"`
	StoredPath    string    `json:"stored_path"`
	FileSizeBytes int64     `json:"file_size_bytes"`
	PageCount     *int      `json:"page_count"`
	Status        string    `json:"status"`
	ErrorMessage  *string   `json:"error_message,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type DocumentChunk struct {
	ID         uuid.UUID `json:"id"`
	DocumentID uuid.UUID `json:"document_id"`
	ChunkIndex int       `json:"chunk_index"`
	Content    string    `json:"content"`
	TokenCount int       `json:"token_count"`
	MilvusID   int64     `json:"milvus_id"`
	CreatedAt  time.Time `json:"created_at"`
}

type GeneratedQuestion struct {
	ID            uuid.UUID       `json:"id"`
	DocumentID    uuid.UUID       `json:"document_id"`
	ChunkID       *uuid.UUID      `json:"chunk_id,omitempty"`
	SubjectID     uuid.UUID       `json:"subject_id"`
	CreatedBy     uuid.UUID       `json:"created_by"`
	QuestionText  string          `json:"question_text"`
	QuestionType  QuestionType    `json:"question_type"`
	Difficulty    DifficultyLevel `json:"difficulty"`
	TopicTag      string          `json:"topic_tag"`
	CorrectAnswer string          `json:"correct_answer"`
	Choices       interface{}     `json:"choices,omitempty"` // JSONB
	Points        *float64        `json:"points,omitempty"`  // from exam_questions join
	IsApproved    bool            `json:"is_approved"`
	IsDeleted     bool            `json:"is_deleted"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type Exam struct {
	ID                  uuid.UUID  `json:"id"`
	SubjectID           uuid.UUID  `json:"subject_id"`
	CreatedBy           uuid.UUID  `json:"created_by"`
	Title               string     `json:"title"`
	Instructions        string     `json:"instructions"`
	TimeLimitMinutes    *int       `json:"time_limit_minutes"`
	PassingScore        *float64   `json:"passing_score"`
	RandomizeQuestions  bool       `json:"randomize_questions"`
	Status              ExamStatus `json:"status"`
	AvailableFrom       *time.Time `json:"available_from"`
	AvailableUntil      *time.Time `json:"available_until"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type StudentExamAttempt struct {
	ID          uuid.UUID     `json:"id"`
	ExamID      uuid.UUID     `json:"exam_id"`
	StudentID   uuid.UUID     `json:"student_id"`
	Status      AttemptStatus `json:"status"`
	StartedAt   time.Time     `json:"started_at"`
	SubmittedAt *time.Time    `json:"submitted_at"`
	TotalScore  *float64      `json:"total_score"`
	MaxScore    *float64      `json:"max_score"`
	Percentage  *float64      `json:"percentage"`
}

type StudentAnswer struct {
	ID           uuid.UUID  `json:"id"`
	AttemptID    uuid.UUID  `json:"attempt_id"`
	QuestionID   uuid.UUID  `json:"question_id"`
	AnswerText   string     `json:"answer_text"`
	IsCorrect    *bool      `json:"is_correct"`
	PointsEarned *float64   `json:"points_earned"`
	ScoredBy     *string    `json:"scored_by"`
	ScoredAt     *time.Time `json:"scored_at"`
}
