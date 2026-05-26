package repository

import (
	"context"
	"fmt"

	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type examRepo struct{ db *pgxpool.Pool }

func NewExamRepo(db *pgxpool.Pool) ExamRepository { return &examRepo{db: db} }

func (r *examRepo) Create(ctx context.Context, subjectID, createdBy uuid.UUID, title, instructions string,
	timeLimitMinutes *int, passingScore *float64, randomize bool, questionIDs []uuid.UUID) (*models.Exam, error) {

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	exam := &models.Exam{}
	err = tx.QueryRow(ctx,
		`INSERT INTO exams(subject_id,created_by,title,instructions,time_limit_minutes,passing_score,randomize_questions)
		 VALUES($1,$2,$3,$4,$5,$6,$7)
		 RETURNING id,subject_id,created_by,title,instructions,time_limit_minutes,passing_score,randomize_questions,status,created_at,updated_at`,
		subjectID, createdBy, title, instructions, timeLimitMinutes, passingScore, randomize).
		Scan(&exam.ID, &exam.SubjectID, &exam.CreatedBy, &exam.Title, &exam.Instructions,
			&exam.TimeLimitMinutes, &exam.PassingScore, &exam.RandomizeQuestions, &exam.Status,
			&exam.CreatedAt, &exam.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert exam: %w", err)
	}

	// Fetch each question's difficulty to assign points
	diffRows, err := tx.Query(ctx,
		`SELECT id, difficulty FROM generated_questions WHERE id = ANY($1)`, questionIDs)
	if err != nil {
		return nil, fmt.Errorf("fetch question difficulties: %w", err)
	}
	diffMap := make(map[uuid.UUID]string)
	for diffRows.Next() {
		var id uuid.UUID
		var diff string
		if err := diffRows.Scan(&id, &diff); err != nil {
			diffRows.Close()
			return nil, err
		}
		diffMap[id] = diff
	}
	diffRows.Close()

	pointsFor := map[string]float64{"easy": 1.0, "medium": 3.0, "hard": 5.0}

	for pos, qID := range questionIDs {
		pts := pointsFor[diffMap[qID]]
		if pts == 0 {
			pts = 1.0
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO exam_questions(exam_id,question_id,position,points) VALUES($1,$2,$3,$4)`,
			exam.ID, qID, pos+1, pts)
		if err != nil {
			return nil, fmt.Errorf("insert exam_question: %w", err)
		}
	}

	return exam, tx.Commit(ctx)
}

func (r *examRepo) FindByID(ctx context.Context, id uuid.UUID) (*models.Exam, error) {
	exam := &models.Exam{}
	err := r.db.QueryRow(ctx,
		`SELECT id,subject_id,created_by,title,instructions,time_limit_minutes,passing_score,
		        randomize_questions,status,available_from,available_until,created_at,updated_at
		 FROM exams WHERE id=$1`, id).
		Scan(&exam.ID, &exam.SubjectID, &exam.CreatedBy, &exam.Title, &exam.Instructions,
			&exam.TimeLimitMinutes, &exam.PassingScore, &exam.RandomizeQuestions, &exam.Status,
			&exam.AvailableFrom, &exam.AvailableUntil, &exam.CreatedAt, &exam.UpdatedAt)
	return exam, err
}

func (r *examRepo) ListBySubject(ctx context.Context, subjectID uuid.UUID) ([]*models.Exam, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id,subject_id,created_by,title,status,time_limit_minutes,available_from,available_until,created_at
		 FROM exams WHERE subject_id=$1 ORDER BY created_at DESC`, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var exams []*models.Exam
	for rows.Next() {
		e := &models.Exam{}
		if err := rows.Scan(&e.ID, &e.SubjectID, &e.CreatedBy, &e.Title, &e.Status,
			&e.TimeLimitMinutes, &e.AvailableFrom, &e.AvailableUntil, &e.CreatedAt); err != nil {
			return nil, err
		}
		exams = append(exams, e)
	}
	return exams, nil
}

func (r *examRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status models.ExamStatus) error {
	_, err := r.db.Exec(ctx, `UPDATE exams SET status=$1,updated_at=NOW() WHERE id=$2`, status, id)
	return err
}

func (r *examRepo) GetQuestions(ctx context.Context, examID uuid.UUID) ([]*models.GeneratedQuestion, error) {
	rows, err := r.db.Query(ctx,
		`SELECT gq.id,gq.question_text,gq.question_type,gq.difficulty,gq.topic_tag,gq.correct_answer,gq.choices,eq.points
		 FROM generated_questions gq
		 JOIN exam_questions eq ON eq.question_id=gq.id
		 WHERE eq.exam_id=$1 ORDER BY eq.position`, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var qs []*models.GeneratedQuestion
	for rows.Next() {
		q := &models.GeneratedQuestion{}
		if err := rows.Scan(&q.ID, &q.QuestionText, &q.QuestionType, &q.Difficulty,
			&q.TopicTag, &q.CorrectAnswer, &q.Choices, &q.Points); err != nil {
			return nil, err
		}
		qs = append(qs, q)
	}
	return qs, nil
}

// ListPublishedForStudent returns all published exams for subjects the student is enrolled in.
func (r *examRepo) ListPublishedForStudent(ctx context.Context, studentID uuid.UUID) ([]*models.Exam, error) {
	rows, err := r.db.Query(ctx, `
		SELECT e.id, e.subject_id, e.created_by, e.title, e.status,
		       e.time_limit_minutes, e.available_from, e.available_until, e.created_at
		FROM exams e
		JOIN subject_enrollments se ON se.subject_id = e.subject_id
		WHERE se.student_id = $1
		  AND e.status = 'published'
		  AND (e.available_until IS NULL OR e.available_until > NOW())
		ORDER BY e.created_at DESC
	`, studentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var exams []*models.Exam
	for rows.Next() {
		ex := &models.Exam{}
		if err := rows.Scan(&ex.ID, &ex.SubjectID, &ex.CreatedBy, &ex.Title, &ex.Status,
			&ex.TimeLimitMinutes, &ex.AvailableFrom, &ex.AvailableUntil, &ex.CreatedAt); err != nil {
			return nil, err
		}
		exams = append(exams, ex)
	}
	if exams == nil {
		exams = []*models.Exam{}
	}
	return exams, nil
}
