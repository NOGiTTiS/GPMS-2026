package controllers

import (
	"fmt"
	"strconv"
	"time"

	"gpms-backend/config"
	"gpms-backend/models"
	"gpms-backend/telegram"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type GradeWorkloadInput struct {
	SubmissionID uint    `json:"submission_id"`
	Score        float64 `json:"score"`
	Comment      string  `json:"comment"`
}

func GradeWorkload(c *fiber.Ctx) error {
	teacherID := c.Locals("userID").(uint)

	input := new(GradeWorkloadInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Verify submission exists
	var sub models.Submission
	if err := config.DB.Preload("Group").Preload("Workload").Preload("Student").Preload("SubmittedBy").First(&sub, input.SubmissionID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Submission not found"})
	}

	var grade models.WorkloadGrade
	err := config.DB.Where("submission_id = ?", sub.ID).First(&grade).Error

	var teacher models.User
	config.DB.First(&teacher, teacherID)

	tx := config.DB.Begin()

	if err == gorm.ErrRecordNotFound {
		grade = models.WorkloadGrade{
			SubmissionID: sub.ID,
			GradedByID:   teacherID,
			Score:        input.Score,
			Comment:      input.Comment,
			GradedAt:     time.Now(),
		}
		tx.Create(&grade)
	} else {
		grade.GradedByID = teacherID
		grade.Score = input.Score
		grade.Comment = input.Comment
		grade.GradedAt = time.Now()
		tx.Save(&grade)
	}

	// Log group activity if it's a group submission
	if sub.GroupID != nil {
		log := models.GroupActivityLog{
			GroupID:     *sub.GroupID,
			ActionByID:  teacherID,
			ActionType:  "GRADING",
			Description: fmt.Sprintf("ตรวจให้คะแนนภาระงาน '%s': ได้ %.2f คะแนน โดยครู %s", sub.Workload.Title, grade.Score, teacher.FullName),
		}
		tx.Create(&log)
	}

	tx.Commit()

	// Telegram Notification
	targetLabel := "นักเรียน"
	targetName := sub.Student.FullName
	if sub.Group != nil && sub.Group.Name != "" {
		targetLabel = "กลุ่ม"
		targetName = sub.Group.Name
	}
	if targetName == "" {
		targetName = fmt.Sprintf("รหัสนักเรียน %d", sub.StudentID)
	}

	telegramMessage := fmt.Sprintf(
		"📝 <b>ตรวจงานเสร็จสิ้นแล้ว!</b>\n\n"+
			"<b>%s:</b> %s\n"+
			"<b>ภาระงาน:</b> %s\n"+
			"<b>ผู้ประเมิน:</b> %s\n"+
			"<b>คะแนนที่ได้:</b> %.2f / %.2f\n"+
			"<b>ความเห็นเพิ่มเติม:</b> %s",
		targetLabel, targetName, sub.Workload.Title, teacher.FullName, grade.Score, sub.Workload.MaxScore, grade.Comment,
	)
	telegram.NotifyStudent(telegramMessage)
	telegram.NotifyAdmin(telegramMessage)

	return c.JSON(grade)
}

type FinalGradeItem struct {
	CriteriaID uint    `json:"criteria_id"`
	Score      float64 `json:"score"`
	Comment    string  `json:"comment"`
}

type GradeFinalProjectInput struct {
	SubmissionID uint             `json:"submission_id"`
	Grades       []FinalGradeItem `json:"grades"`
}

func GradeFinalProject(c *fiber.Ctx) error {
	teacherID := c.Locals("userID").(uint)

	input := new(GradeFinalProjectInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Verify submission exists
	var sub models.FinalProjectSubmission
	if err := config.DB.Preload("Group").First(&sub, input.SubmissionID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Final project submission not found"})
	}

	var teacher models.User
	config.DB.First(&teacher, teacherID)

	tx := config.DB.Begin()

	for _, item := range input.Grades {
		var grade models.FinalProjectGrade
		err := tx.Where("final_project_submission_id = ? AND criteria_id = ? AND teacher_id = ?",
			sub.ID, item.CriteriaID, teacherID).First(&grade).Error

		if err == gorm.ErrRecordNotFound {
			grade = models.FinalProjectGrade{
				FinalProjectSubmissionID: sub.ID,
				CriteriaID:                item.CriteriaID,
				TeacherID:                 teacherID,
				Score:                     item.Score,
				Comment:                   item.Comment,
				GradedAt:                  time.Now(),
			}
			tx.Create(&grade)
		} else {
			grade.Score = item.Score
			grade.Comment = item.Comment
			grade.GradedAt = time.Now()
			tx.Save(&grade)
		}
	}

	// Log group activity
	log := models.GroupActivityLog{
		GroupID:     sub.GroupID,
		ActionByID:  teacherID,
		ActionType:  "FINAL_GRADING",
		Description: fmt.Sprintf("ประเมินคะแนนสะสม Final Project โดยอาจารย์กรรมการ %s", teacher.FullName),
	}
	tx.Create(&log)

	tx.Commit()

	// Notify Telegram
	telegramMessage := fmt.Sprintf(
		"🎓 <b>กรรมการให้คะแนน Final Project แล้ว!</b>\n\n"+
			"<b>กลุ่ม:</b> %s\n"+
			"<b>หัวข้องาน:</b> %s\n"+
			"<b>กรรมการ:</b> %s\n"+
			"<b>สถานะ:</b> บันทึกผลคะแนนเฉลี่ยอัปเดตเรียบร้อยในระบบ",
		sub.Group.Name, sub.Group.ProjectTopic, teacher.FullName,
	)
	telegram.NotifyStudent(telegramMessage)
	telegram.NotifyAdmin(telegramMessage)

	return c.JSON(fiber.Map{"status": "success"})
}

func GetSupervisedClassrooms(c *fiber.Ctx) error {
	teacherID := c.Locals("userID").(uint)
	var teacher models.User
	if err := config.DB.First(&teacher, teacherID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Teacher not found"})
	}

	semesterIDStr := c.Query("semester_id")
	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	}

	// Fetch classrooms assigned to this teacher
	var classrooms []models.Classroom
	query := config.DB.
		Joins("JOIN classroom_teachers ON classroom_teachers.classroom_id = classrooms.id").
		Where("classroom_teachers.user_id = ?", teacherID).
		Preload("Semester")

	if semesterID > 0 {
		query = query.Where("classrooms.semester_id = ?", semesterID)
	}

	query.Find(&classrooms)

	return c.JSON(classrooms)
}

func GetSupervisedGroups(c *fiber.Ctx) error {
	teacherID := c.Locals("userID").(uint)
	
	semesterIDStr := c.Query("semester_id")
	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		semesterID, _ = getActiveSemesterID()
	}

	// Get classrooms supervised by this teacher
	var classroomIDs []uint
	config.DB.Table("classroom_teachers").
		Where("user_id = ?", teacherID).
		Pluck("classroom_id", &classroomIDs)

	if len(classroomIDs) == 0 {
		return c.JSON([]models.Group{})
	}

	var groups []models.Group
	config.DB.
		Preload("Members").
		Preload("Classroom").
		Where("classroom_id IN ? AND semester_id = ?", classroomIDs, semesterID).
		Find(&groups)

	return c.JSON(groups)
}

func GetSubmissionsToGrade(c *fiber.Ctx) error {
	teacherID := c.Locals("userID").(uint)
	
	semesterIDStr := c.Query("semester_id")
	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		semesterID, _ = getActiveSemesterID()
	}

	var classroomIDs []uint
	config.DB.Table("classroom_teachers").
		Where("user_id = ?", teacherID).
		Pluck("classroom_id", &classroomIDs)

	if len(classroomIDs) == 0 {
		return c.JSON([]models.Submission{})
	}

	var groupSubs []models.Submission
	config.DB.
		Preload("Group").
		Preload("Group.Classroom").
		Preload("Group.Members").
		Preload("Student").
		Preload("SubmittedBy").
		Preload("Workload").
		Preload("Grade").
		Joins("JOIN groups ON groups.id = submissions.group_id").
		Where("groups.classroom_id IN ? AND groups.semester_id = ?", classroomIDs, semesterID).
		Order("submissions.submitted_at desc").
		Find(&groupSubs)

	var indivSubs []models.Submission
	config.DB.
		Preload("Student").
		Preload("SubmittedBy").
		Preload("Workload").
		Preload("Grade").
		Joins("JOIN workloads ON workloads.id = submissions.workload_id").
		Joins("JOIN students ON students.user_id = submissions.student_id").
		Where("submissions.group_id IS NULL AND students.classroom_id IN ? AND workloads.semester_id = ?", classroomIDs, semesterID).
		Order("submissions.submitted_at desc").
		Find(&indivSubs)

	allSubmissions := append(groupSubs, indivSubs...)

	return c.JSON(allSubmissions)
}

func GetFinalProjectsToGrade(c *fiber.Ctx) error {
	semesterIDStr := c.Query("semester_id")
	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		semesterID, _ = getActiveSemesterID()
	}

	var submissions []models.FinalProjectSubmission
	config.DB.
		Preload("Group.Classroom").
		Preload("Grades").
		Joins("JOIN groups ON groups.id = final_project_submissions.group_id").
		Where("groups.semester_id = ?", semesterID).
		Find(&submissions)

	return c.JSON(submissions)
}
