package controllers

import (
	"strconv"
	"time"

	"gpms-backend/config"
	"gpms-backend/models"

	"github.com/gofiber/fiber/v2"
)

type WorkloadProgress struct {
	WorkloadID      uint    `json:"workload_id"`
	Title           string  `json:"title"`
	TotalSubmissions int     `json:"total_submissions"`
	SubmissionRate  float64 `json:"submission_rate"` // percentage
}

func GetDashboardStats(c *fiber.Ctx) error {
	userRole := c.Locals("role").(string)
	userID := c.Locals("userID").(uint)
	semesterIDStr := c.Query("semester_id")

	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			semesterID = activeSem.ID
		}
	}

	// 1. Total Groups in the semester
	var totalGroups int64
	config.DB.Model(&models.Group{}).Where("semester_id = ?", semesterID).Count(&totalGroups)

	// 2. Submission Rate per Workload
	var workloads []models.Workload
	config.DB.Where("semester_id = ?", semesterID).Find(&workloads)

	progressList := make([]WorkloadProgress, 0)
	for _, wl := range workloads {
		var subCount int64
		config.DB.Model(&models.Submission{}).Where("workload_id = ?", wl.ID).Count(&subCount)

		rate := 0.0
		if totalGroups > 0 {
			rate = (float64(subCount) / float64(totalGroups)) * 100.0
		}

		progressList = append(progressList, WorkloadProgress{
			WorkloadID:      wl.ID,
			Title:           wl.Title,
			TotalSubmissions: int(subCount),
			SubmissionRate:  rate,
		})
	}

	// 3. Graded/Ungraded workloads count
	var gradedCount int64
	var ungradedCount int64
	config.DB.Table("submissions").
		Joins("JOIN workloads ON workloads.id = submissions.workload_id").
		Joins("LEFT JOIN workload_grades ON workload_grades.submission_id = submissions.id").
		Where("workloads.semester_id = ? AND workload_grades.id IS NOT NULL", semesterID).
		Count(&gradedCount)

	config.DB.Table("submissions").
		Joins("JOIN workloads ON workloads.id = submissions.workload_id").
		Joins("LEFT JOIN workload_grades ON workload_grades.submission_id = submissions.id").
		Where("workloads.semester_id = ? AND workload_grades.id IS NULL", semesterID).
		Count(&ungradedCount)

	// 4. Leaderboard (for students & all roles can view)
	type LeaderboardItem struct {
		GroupID            uint    `json:"group_id"`
		GroupName          string  `json:"group_name"`
		ProjectTopic       string  `json:"project_topic"`
		ClassroomName      string  `json:"classroom_name"`
		AccumulatedScore   float64 `json:"accumulated_score"`
		FinalProjectScore  float64 `json:"final_project_score"`
		TotalScore         float64 `json:"total_score"`
	}

	var groups []models.Group
	config.DB.Preload("Classroom").Preload("Submissions.Grade").Where("semester_id = ?", semesterID).Find(&groups)

	// Fetch final project criteria to calculate weighted score
	var criteria []models.FinalProjectCriteria
	config.DB.Where("semester_id = ?", semesterID).Find(&criteria)

	leaderboard := make([]LeaderboardItem, 0)
	for _, g := range groups {
		// Calculate workload score
		wlScore := 0.0
		for _, sub := range g.Submissions {
			if sub.Grade != nil {
				wlScore += sub.Grade.Score
			}
		}

		// Calculate Final Project average score
		var finalSub models.FinalProjectSubmission
		finalScore := 0.0
		if err := config.DB.Preload("Grades").Where("group_id = ?", g.ID).First(&finalSub).Error; err == nil {
			// We have grades from teachers
			// Group grades by teacher to calculate each teacher's weighted score first
			teacherGrades := make(map[uint]map[uint]float64) // teacher_id -> criteria_id -> score
			for _, gr := range finalSub.Grades {
				if _, ok := teacherGrades[gr.TeacherID]; !ok {
					teacherGrades[gr.TeacherID] = make(map[uint]float64)
				}
				teacherGrades[gr.TeacherID][gr.CriteriaID] = gr.Score
			}

			// Calculate weighted score for each teacher
			teacherTotalScores := make([]float64, 0)
			for _, cGrades := range teacherGrades {
				weightedSum := 0.0
				weightTotal := 0.0
				for _, crit := range criteria {
					score, ok := cGrades[crit.ID]
					if !ok {
						score = 0.0 // not graded by this teacher for this criteria
					}
					// weighted score = score * (weight / 100)
					weightedSum += score * (crit.Weight / 100.0)
					weightTotal += crit.Weight
				}
				teacherTotalScores = append(teacherTotalScores, weightedSum)
			}

			// Average the teachers
			if len(teacherTotalScores) > 0 {
				sum := 0.0
				for _, s := range teacherTotalScores {
					sum += s
				}
				finalScore = sum / float64(len(teacherTotalScores))
			}
		}

		leaderboard = append(leaderboard, LeaderboardItem{
			GroupID:            g.ID,
			GroupName:          g.Name,
			ProjectTopic:       g.ProjectTopic,
			ClassroomName:      g.Classroom.Name,
			AccumulatedScore:   wlScore,
			FinalProjectScore:  finalScore,
			TotalScore:         wlScore + finalScore,
		})
	}

	// Sort leaderboard by TotalScore descending
	for i := 0; i < len(leaderboard); i++ {
		for j := i + 1; j < len(leaderboard); j++ {
			if leaderboard[i].TotalScore < leaderboard[j].TotalScore {
				leaderboard[i], leaderboard[j] = leaderboard[j], leaderboard[i]
			}
		}
	}

	// If logged in user is a student, also return their own group rank
	var myGroupInfo fiber.Map = nil
	if userRole == string(models.RoleStudent) {
		var member models.GroupMember
		if err := config.DB.Where("student_id = ?", userID).First(&member).Error; err == nil {
			rank := 0
			var myItem LeaderboardItem
			for idx, item := range leaderboard {
				if item.GroupID == member.GroupID {
					rank = idx + 1
					myItem = item
					break
				}
			}
			if rank > 0 {
				myGroupInfo = fiber.Map{
					"rank":              rank,
					"accumulated_score": myItem.AccumulatedScore,
					"final_score":       myItem.FinalProjectScore,
					"total_score":       myItem.TotalScore,
				}
			}
		}
	}

	return c.JSON(fiber.Map{
		"total_groups":      totalGroups,
		"workload_progress": progressList,
		"graded_count":      gradedCount,
		"ungraded_count":    ungradedCount,
		"leaderboard":       leaderboard,
		"my_group":          myGroupInfo,
	})
}

type ReportRow struct {
	GroupID             uint      `json:"group_id"`
	GroupName           string    `json:"group_name"`
	ClassroomName       string    `json:"classroom_name"`
	ProjectTopic        string    `json:"project_topic"`
	LeaderName          string    `json:"leader_name"`
	Members             []string  `json:"members"`
	WorkloadScores      []float64 `json:"workload_scores"` // in order of workloads
	AccumulatedScore    float64   `json:"accumulated_score"`
	FinalCriteriaScores  []float64 `json:"final_criteria_scores"` // in order of criteria
	FinalUnweightedScore float64   `json:"final_unweighted_score"`
	FinalProjectScore    float64   `json:"final_project_score"`
	TotalScore           float64   `json:"total_score"`
}

func GetReportData(c *fiber.Ctx) error {
	semesterIDStr := c.Query("semester_id")
	classroomIDStr := c.Query("classroom_id")

	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			semesterID = activeSem.ID
		}
	}

	// Get all workloads for score matching
	var workloads []models.Workload
	config.DB.Where("semester_id = ?", semesterID).Order("id asc").Find(&workloads)

	query := config.DB.
		Preload("Classroom").
		Preload("Members").
		Preload("LeaderStudent").
		Preload("Submissions.Grade").
		Where("semester_id = ?", semesterID)

	if classroomIDStr != "" {
		id, _ := strconv.Atoi(classroomIDStr)
		query = query.Where("classroom_id = ?", uint(id))
	}

	var groups []models.Group
	query.Find(&groups)

	// Fetch final project criteria
	var criteria []models.FinalProjectCriteria
	config.DB.Where("semester_id = ?", semesterID).Find(&criteria)

	reportRows := make([]ReportRow, 0)

	for _, g := range groups {
		// Get member names
		memberNames := make([]string, 0)
		for _, m := range g.Members {
			memberNames = append(memberNames, m.FullName)
		}

		// Match submissions to workloads to extract score in order
		wlScores := make([]float64, len(workloads))
		accumulated := 0.0
		for i, wl := range workloads {
			var score float64 = 0.0
			for _, sub := range g.Submissions {
				if sub.WorkloadID == wl.ID && sub.Grade != nil {
					score = sub.Grade.Score
					break
				}
			}
			wlScores[i] = score
			accumulated += score
		}

		// Calculate Final Project average score and criteria breakdown
		finalCriteriaScores := make([]float64, len(criteria))
		var finalSub models.FinalProjectSubmission
		finalScore := 0.0
		if err := config.DB.Preload("Grades").Where("group_id = ?", g.ID).First(&finalSub).Error; err == nil {
			teacherGrades := make(map[uint]map[uint]float64)
			for _, gr := range finalSub.Grades {
				if _, ok := teacherGrades[gr.TeacherID]; !ok {
					teacherGrades[gr.TeacherID] = make(map[uint]float64)
				}
				teacherGrades[gr.TeacherID][gr.CriteriaID] = gr.Score
			}

			// Calculate average score for each criteria
			for cIdx, crit := range criteria {
				critSum := 0.0
				gradedTeachersCount := 0
				for _, cGrades := range teacherGrades {
					if score, ok := cGrades[crit.ID]; ok {
						critSum += score
						gradedTeachersCount++
					}
				}
				if gradedTeachersCount > 0 {
					finalCriteriaScores[cIdx] = critSum / float64(gradedTeachersCount)
				}
			}

			teacherTotalScores := make([]float64, 0)
			for _, cGrades := range teacherGrades {
				weightedSum := 0.0
				for _, crit := range criteria {
					score, ok := cGrades[crit.ID]
					if !ok {
						score = 0.0
					}
					weightedSum += score * (crit.Weight / 100.0)
				}
				teacherTotalScores = append(teacherTotalScores, weightedSum)
			}

			if len(teacherTotalScores) > 0 {
				sum := 0.0
				for _, s := range teacherTotalScores {
					sum += s
				}
				finalScore = sum / float64(len(teacherTotalScores))
			}
		}

		finalUnweightedScore := 0.0
		for _, s := range finalCriteriaScores {
			finalUnweightedScore += s
		}

		reportRows = append(reportRows, ReportRow{
			GroupID:              g.ID,
			GroupName:            g.Name,
			ClassroomName:        g.Classroom.Name,
			ProjectTopic:         g.ProjectTopic,
			LeaderName:           g.LeaderStudent.FullName,
			Members:              memberNames,
			WorkloadScores:       wlScores,
			AccumulatedScore:     accumulated,
			FinalCriteriaScores:  finalCriteriaScores,
			FinalUnweightedScore: finalUnweightedScore,
			FinalProjectScore:    finalScore,
			TotalScore:           accumulated + finalScore,
		})
	}

	return c.JSON(fiber.Map{
		"workloads": workloads,
		"criteria":  criteria,
		"rows":      reportRows,
	})
}

type OverviewSubmissionGrade struct {
	Score        float64   `json:"score"`
	Comment      string    `json:"comment"`
	GradedByName string    `json:"graded_by_name"`
	GradedAt     time.Time `json:"graded_at"`
}

type OverviewSubmissionDetail struct {
	SubmissionID    uint                     `json:"submission_id"`
	Submitted       bool                     `json:"submitted"`
	SubmittedAt     *time.Time               `json:"submitted_at,omitempty"`
	IsLate          bool                     `json:"is_late"`
	FilePath        string                   `json:"file_path"`
	LinkURL         string                   `json:"link_url"`
	SubmittedByName string                   `json:"submitted_by_name"`
	Grade           *OverviewSubmissionGrade `json:"grade,omitempty"`
}

type OverviewGroupItem struct {
	GroupID        uint                              `json:"group_id"`
	GroupName      string                            `json:"group_name"`
	ProjectTopic   string                            `json:"project_topic"`
	ClassroomID    uint                              `json:"classroom_id"`
	ClassroomName  string                            `json:"classroom_name"`
	LeaderName     string                            `json:"leader_name"`
	Members        []string                          `json:"members"`
	SubmittedCount int                               `json:"submitted_count"`
	TotalWorkloads int                               `json:"total_workloads"`
	Submissions    map[uint]OverviewSubmissionDetail `json:"submissions"`
}

func GetWorkloadOverview(c *fiber.Ctx) error {
	semesterIDStr := c.Query("semester_id")
	classroomIDStr := c.Query("classroom_id")

	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			semesterID = activeSem.ID
		}
	}

	var semester models.Semester
	config.DB.First(&semester, semesterID)

	// Get all workloads for the semester
	var workloads []models.Workload
	config.DB.Where("semester_id = ?", semesterID).Order("deadline asc, id asc").Find(&workloads)

	// Fetch groups with preloads
	query := config.DB.
		Preload("Classroom").
		Preload("LeaderStudent").
		Preload("Members").
		Preload("Submissions.SubmittedBy").
		Preload("Submissions.Grade.GradedBy").
		Where("semester_id = ?", semesterID)

	if classroomIDStr != "" && classroomIDStr != "all" {
		id, _ := strconv.Atoi(classroomIDStr)
		query = query.Where("classroom_id = ?", uint(id))
	}

	var groups []models.Group
	query.Find(&groups)

	overviewGroups := make([]OverviewGroupItem, 0)

	for _, g := range groups {
		memberNames := make([]string, 0)
		for _, m := range g.Members {
			memberNames = append(memberNames, m.FullName)
		}

		subMap := make(map[uint]OverviewSubmissionDetail)
		submittedCount := 0

		// Build map for each workload
		for _, wl := range workloads {
			var subDetail OverviewSubmissionDetail
			subDetail.Submitted = false

			for _, sub := range g.Submissions {
				if sub.WorkloadID == wl.ID {
					subDetail.Submitted = true
					subDetail.SubmissionID = sub.ID
					subDetail.SubmittedAt = &sub.SubmittedAt
					subDetail.IsLate = sub.IsLate
					subDetail.FilePath = sub.FilePath
					subDetail.LinkURL = sub.LinkURL
					if sub.SubmittedBy.FullName != "" {
						subDetail.SubmittedByName = sub.SubmittedBy.FullName
					}

					if sub.Grade != nil {
						subDetail.Grade = &OverviewSubmissionGrade{
							Score:        sub.Grade.Score,
							Comment:      sub.Grade.Comment,
							GradedByName: sub.Grade.GradedBy.FullName,
							GradedAt:     sub.Grade.GradedAt,
						}
					}
					submittedCount++
					break
				}
			}
			subMap[wl.ID] = subDetail
		}

		leaderName := ""
		if g.LeaderStudent.FullName != "" {
			leaderName = g.LeaderStudent.FullName
		}

		overviewGroups = append(overviewGroups, OverviewGroupItem{
			GroupID:        g.ID,
			GroupName:      g.Name,
			ProjectTopic:   g.ProjectTopic,
			ClassroomID:    g.ClassroomID,
			ClassroomName:  g.Classroom.Name,
			LeaderName:     leaderName,
			Members:        memberNames,
			SubmittedCount: submittedCount,
			TotalWorkloads: len(workloads),
			Submissions:    subMap,
		})
	}

	return c.JSON(fiber.Map{
		"semester":  semester,
		"workloads": workloads,
		"groups":    overviewGroups,
	})
}

