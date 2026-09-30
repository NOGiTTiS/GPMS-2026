package controllers

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"gpms-backend/config"
	"gpms-backend/models"
	"gpms-backend/telegram"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// Helper to get active semester ID
func getActiveSemesterID() (uint, error) {
	var sem models.Semester
	err := config.DB.Where("is_active = ?", true).First(&sem).Error
	if err != nil {
		return 0, errors.New("no active semester found")
	}
	return sem.ID, nil
}

// Helper to check if student is already in a group for active semester
func getStudentGroup(studentID uint, semesterID uint) (*models.Group, error) {
	var groupMember models.GroupMember
	
	// Query to see if student is in any group
	err := config.DB.Table("group_members").
		Joins("JOIN groups ON groups.id = group_members.group_id").
		Where("group_members.student_id = ? AND groups.semester_id = ?", studentID, semesterID).
		First(&groupMember).Error

	if err != nil {
		return nil, err
	}

	var group models.Group
	if err := config.DB.Preload("Members").Preload("Classroom").First(&group, groupMember.GroupID).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

func CreateGroup(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	semesterID, err := getActiveSemesterID()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Fetch student details (classroom)
	var student models.Student
	if err := config.DB.Where("user_id = ?", userID).First(&student).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "You are not registered as a student"})
	}

	// Verify that student's classroom belongs to the active semester
	var classroom models.Classroom
	if err := config.DB.Where("id = ? AND semester_id = ?", student.ClassroomID, semesterID).First(&classroom).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "คุณไม่ได้ลงทะเบียนในห้องเรียนของภาคเรียนปัจจุบัน"})
	}

	// Check if already in a group
	existingGroup, _ := getStudentGroup(userID, semesterID)
	if existingGroup != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "You already belong to a group this semester"})
	}

	type CreateGroupInput struct {
		Name         string `json:"name"`
		ProjectTopic string `json:"project_topic"`
	}

	input := new(CreateGroupInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	tx := config.DB.Begin()

	group := models.Group{
		Name:            input.Name,
		ProjectTopic:    input.ProjectTopic,
		LeaderStudentID: userID,
		ClassroomID:     student.ClassroomID,
		SemesterID:      semesterID,
	}

	if err := tx.Create(&group).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create group"})
	}

	// Add leader as first member
	member := models.GroupMember{
		GroupID:   group.ID,
		StudentID: userID,
		JoinedAt:  time.Now(),
	}

	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to add leader to group"})
	}

	// Log activity
	log := models.GroupActivityLog{
		GroupID:     group.ID,
		ActionByID:  userID,
		ActionType:  "GROUP_CREATE",
		Description: fmt.Sprintf("ตั้งค่ากลุ่มใหม่ในชื่อ '%s' และเสนอหัวข้อ '%s'", group.Name, group.ProjectTopic),
	}
	tx.Create(&log)

	tx.Commit()
	return c.JSON(group)
}

func DeleteGroup(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, err := getActiveSemesterID()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Fetch student's group to verify leader status
	var group models.Group
	if err := config.DB.Where("leader_student_id = ? AND semester_id = ?", userID, semesterID).First(&group).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "คุณไม่ได้เป็นหัวหน้ากลุ่ม หรือไม่มีกลุ่มที่จะลบ"})
	}

	// Check if the group has any workload submissions or final project submissions
	var subCount int64
	config.DB.Model(&models.Submission{}).Where("group_id = ?", group.ID).Count(&subCount)

	var finalSubCount int64
	config.DB.Model(&models.FinalProjectSubmission{}).Where("group_id = ?", group.ID).Count(&finalSubCount)

	if subCount > 0 || finalSubCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ไม่สามารถลบกลุ่มได้เนื่องจากมีการส่งงานในระบบแล้ว"})
	}

	tx := config.DB.Begin()

	// Deleting the group will cascade delete group_members, activity logs, etc.
	if err := tx.Delete(&group).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ลบกลุ่มล้มเหลว"})
	}

	tx.Commit()
	return c.JSON(fiber.Map{"status": "success", "message": "ลบกลุ่มเรียบร้อยแล้ว"})
}


func AddGroupMember(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, _ := getActiveSemesterID()

	// Check if caller is leader of their group
	var group models.Group
	if err := config.DB.Where("leader_student_id = ? AND semester_id = ?", userID, semesterID).First(&group).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the group leader can add members"})
	}

	type AddMemberInput struct {
		StudentID  uint   `json:"student_id"`
		StudentIDs []uint `json:"student_ids"`
	}

	input := new(AddMemberInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Prepare list of target student IDs
	var targetIDs []uint
	if len(input.StudentIDs) > 0 {
		targetIDs = input.StudentIDs
	} else if input.StudentID > 0 {
		targetIDs = []uint{input.StudentID}
	}

	if len(targetIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No student ID provided"})
	}

	// Get limit from settings
	var limitSetting models.SystemSetting
	config.DB.Where("setting_key = ?", "max_group_members").First(&limitSetting)
	maxMembers, _ := strconv.Atoi(limitSetting.SettingValue)
	if maxMembers <= 0 {
		maxMembers = 5
	}

	var currentCount int64
	config.DB.Model(&models.GroupMember{}).Where("group_id = ?", group.ID).Count(&currentCount)
	if currentCount+int64(len(targetIDs)) > int64(maxMembers) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("ไม่สามารถเพิ่มสมาชิกได้เนื่องจากเกินจำกัด (จำกัดสูงสุด %d คน, ปัจจุบันมี %d คน, กำลังจะเพิ่ม %d คน)", maxMembers, currentCount, len(targetIDs)),
		})
	}

	tx := config.DB.Begin()

	for _, studentID := range targetIDs {
		// Verify target student exists and is indeed a student
		var targetStudent models.Student
		if err := tx.Preload("User").Where("user_id = ?", studentID).First(&targetStudent).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("ไม่พบข้อมูลนักเรียนรหัส %d ในระบบ", studentID)})
		}

		// Check if target student already has a group
		targetGroup, _ := getStudentGroup(studentID, semesterID)
		if targetGroup != nil {
			tx.Rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": fmt.Sprintf("นักเรียน %s อยู่กลุ่มอื่นเรียบร้อยแล้ว", targetStudent.User.FullName),
			})
		}

		// Add member
		newMember := models.GroupMember{
			GroupID:   group.ID,
			StudentID: studentID,
			JoinedAt:  time.Now(),
		}

		if err := tx.Create(&newMember).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("ไม่สามารถเพิ่ม %s เข้ากลุ่มได้", targetStudent.User.FullName)})
		}

		// Log activity
		log := models.GroupActivityLog{
			GroupID:     group.ID,
			ActionByID:  userID,
			ActionType:  "MEMBER_ADD",
			Description: fmt.Sprintf("เพิ่มนักเรียน '%s' เข้ามาในกลุ่ม", targetStudent.User.FullName),
		}
		tx.Create(&log)
	}

	tx.Commit()
	return c.JSON(fiber.Map{"status": "success"})
}

func RemoveGroupMember(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, _ := getActiveSemesterID()
	targetStudentIDStr := c.Params("studentId")
	targetStudentID, _ := strconv.Atoi(targetStudentIDStr)

	// Check if caller is leader of their group
	var group models.Group
	if err := config.DB.Where("leader_student_id = ? AND semester_id = ?", userID, semesterID).First(&group).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the group leader can remove members"})
	}

	if uint(targetStudentID) == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "You cannot kick yourself out. You are the leader."})
	}

	var targetUser models.User
	config.DB.First(&targetUser, targetStudentID)

	tx := config.DB.Begin()
	err := tx.Where("group_id = ? AND student_id = ?", group.ID, targetStudentID).Delete(&models.GroupMember{}).Error
	if err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Student is not a member of this group"})
	}

	// Log activity
	log := models.GroupActivityLog{
		GroupID:     group.ID,
		ActionByID:  userID,
		ActionType:  "MEMBER_REMOVE",
		Description: fmt.Sprintf("นำคุณ '%s' ออกจากกลุ่มโดยหัวหน้ากลุ่ม", targetUser.FullName),
	}
	tx.Create(&log)

	tx.Commit()
	return c.JSON(fiber.Map{"status": "success"})
}

func LeaveGroup(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, _ := getActiveSemesterID()

	// Find the student's group
	group, err := getStudentGroup(userID, semesterID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "You don't belong to any group"})
	}

	if group.LeaderStudentID == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "หัวหน้ากลุ่มไม่สามารถออกจากกลุ่มได้โดยตรง หากต้องการยกเลิกกลุ่มกรุณากดปุ่มลบกลุ่ม",
		})
	}

	var user models.User
	config.DB.First(&user, userID)

	tx := config.DB.Begin()
	err = tx.Where("group_id = ? AND student_id = ?", group.ID, userID).Delete(&models.GroupMember{}).Error
	if err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to leave group"})
	}

	// Log activity
	log := models.GroupActivityLog{
		GroupID:     group.ID,
		ActionByID:  userID,
		ActionType:  "MEMBER_LEAVE",
		Description: fmt.Sprintf("คุณ '%s' กดออกจากกลุ่มด้วยตนเอง", user.FullName),
	}
	tx.Create(&log)

	tx.Commit()
	return c.JSON(fiber.Map{"status": "success"})
}

func UpdateGroupTopic(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, _ := getActiveSemesterID()

	var group models.Group
	if err := config.DB.Where("leader_student_id = ? AND semester_id = ?", userID, semesterID).First(&group).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the group leader can update group info"})
	}

	type UpdateTopicInput struct {
		Name         string `json:"name"`
		ProjectTopic string `json:"project_topic"`
	}

	input := new(UpdateTopicInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	tx := config.DB.Begin()
	group.Name = input.Name
	group.ProjectTopic = input.ProjectTopic
	tx.Save(&group)

	// Log activity
	log := models.GroupActivityLog{
		GroupID:     group.ID,
		ActionByID:  userID,
		ActionType:  "TOPIC_CHANGE",
		Description: fmt.Sprintf("แก้ไขชื่อกลุ่มเป็น '%s' และหัวข้อเป็น '%s'", group.Name, group.ProjectTopic),
	}
	tx.Create(&log)

	tx.Commit()
	return c.JSON(group)
}

func GetMyGroup(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, err := getActiveSemesterID()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Query group
	var groupMember models.GroupMember
	err = config.DB.Table("group_members").
		Joins("JOIN groups ON groups.id = group_members.group_id").
		Where("group_members.student_id = ? AND groups.semester_id = ?", userID, semesterID).
		First(&groupMember).Error

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "You don't have a group this semester"})
	}

	var group models.Group
	err = config.DB.
		Preload("Members").
		Preload("Classroom.Teachers").
		Preload("Submissions.Workload").
		Preload("Submissions.Grade").
		First(&group, groupMember.GroupID).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load group details"})
	}

	// Fetch final project submission
	var finalProj models.FinalProjectSubmission
	var hasFinalProj bool
	if err := config.DB.Preload("Grades.Criteria").Preload("Grades.Teacher").Where("group_id = ?", group.ID).First(&finalProj).Error; err == nil {
		hasFinalProj = true
	}

	// Load activity logs
	var logs []models.GroupActivityLog
	config.DB.Preload("ActionBy").Where("group_id = ?", group.ID).Order("created_at desc").Find(&logs)

	res := fiber.Map{
		"group":         group,
		"activity_logs": logs,
	}

	if hasFinalProj {
		res["final_project_submission"] = finalProj
	} else {
		res["final_project_submission"] = nil
	}

	return c.JSON(res)
}

// ==========================================
// WORKLOAD SUBMISSION
// ==========================================

type SubmitWorkloadInput struct {
	WorkloadID uint   `json:"workload_id"`
	FilePath   string `json:"file_path"`
	LinkURL    string `json:"link_url"`
}

func SubmitWorkload(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, _ := getActiveSemesterID()

	input := new(SubmitWorkloadInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var wl models.Workload
	if err := config.DB.First(&wl, input.WorkloadID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Workload not found"})
	}

	// Check if workload is open for submission
	if !wl.IsOpen {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ภาระงานนี้ปิดรับการส่งงานแล้ว"})
	}

	// Determine if late
	isLate := time.Now().After(wl.Deadline)
	if isLate && !wl.AllowLate {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("หมดเวลากำหนดส่งภาระงานนี้แล้ว (สิ้นสุดเมื่อ %s น.) และไม่อนุญาตให้ส่งล่าช้า", wl.Deadline.Format("02/01/2006 15:04")),
		})
	}

	var user models.User
	config.DB.First(&user, userID)

	var student models.Student
	config.DB.Preload("Classroom").Where("user_id = ?", userID).First(&student)

	lateText := ""
	if isLate {
		lateText = " ⚠️ (ส่งล่าช้า)"
	}
	
	attachLabel := "ลิงก์แนบ"
	attachVal := input.LinkURL
	if attachVal == "" && input.FilePath != "" {
		attachLabel = "ไฟล์แนบ"
		attachVal = input.FilePath
	}

	var submission models.Submission
	tx := config.DB.Begin()

	// Check if this workload is individual or group
	if wl.Type == models.WorkloadTypeIndividual {
		// INDIVIDUAL WORKLOAD: Does not require a group
		err := tx.Where("workload_id = ? AND student_id = ? AND group_id IS NULL", wl.ID, userID).First(&submission).Error
		if err == gorm.ErrRecordNotFound {
			submission = models.Submission{
				WorkloadID:    wl.ID,
				GroupID:       nil,
				StudentID:     userID,
				SubmittedByID: userID,
				FilePath:      input.FilePath,
				LinkURL:       input.LinkURL,
				SubmittedAt:   time.Now(),
				IsLate:        isLate,
			}
			if err := tx.Create(&submission).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save submission"})
			}
		} else {
			submission.SubmittedByID = userID
			submission.FilePath = input.FilePath
			submission.LinkURL = input.LinkURL
			submission.SubmittedAt = time.Now()
			submission.IsLate = isLate
			if err := tx.Save(&submission).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update submission"})
			}
		}

		tx.Commit()

		className := "-"
		if student.Classroom.Name != "" {
			className = student.Classroom.Name
		}

		telegramMessage := fmt.Sprintf(
			"🔔 <b>ส่งภาระงานเดี่ยวใหม่!</b>\n\n"+
				"<b>นักเรียน:</b> %s\n"+
				"<b>ห้องเรียน:</b> %s\n"+
				"<b>ภาระงาน:</b> %s (งานเดี่ยว)\n"+
				"<b>เวลาที่ส่ง:</b> %s%s\n"+
				"<b>%s:</b> %s",
			user.FullName, className, wl.Title,
			time.Now().Format("02-01-2006 15:04"), lateText, attachLabel, attachVal,
		)
		telegram.NotifyAdmin(telegramMessage)
		telegram.NotifyStudent(telegramMessage)

		return c.JSON(submission)
	}

	// GROUP WORKLOAD: Requires belonging to a group
	group, err := getStudentGroup(userID, semesterID)
	if err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ภาระงานนี้เป็นงานกลุ่ม กรุณาจัดตั้งหรือเข้าร่วมกลุ่มก่อนนำส่งงาน"})
	}

	err = tx.Where("workload_id = ? AND group_id = ?", wl.ID, group.ID).First(&submission).Error
	if err == gorm.ErrRecordNotFound {
		submission = models.Submission{
			WorkloadID:    wl.ID,
			GroupID:       &group.ID,
			StudentID:     userID,
			SubmittedByID: userID,
			FilePath:      input.FilePath,
			LinkURL:       input.LinkURL,
			SubmittedAt:   time.Now(),
			IsLate:        isLate,
		}
		if err := tx.Create(&submission).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save submission"})
		}
	} else {
		submission.GroupID = &group.ID
		submission.StudentID = userID
		submission.SubmittedByID = userID
		submission.FilePath = input.FilePath
		submission.LinkURL = input.LinkURL
		submission.SubmittedAt = time.Now()
		submission.IsLate = isLate
		if err := tx.Save(&submission).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update submission"})
		}
	}

	// Log activity
	attachmentInfo := ""
	if submission.LinkURL != "" {
		attachmentInfo = fmt.Sprintf("ลิงก์: %s", submission.LinkURL)
	} else if submission.FilePath != "" {
		attachmentInfo = fmt.Sprintf("ไฟล์: %s", submission.FilePath)
	}

	log := models.GroupActivityLog{
		GroupID:     group.ID,
		ActionByID:  userID,
		ActionType:  "SUBMISSION",
		Description: fmt.Sprintf("ส่งภาระงาน '%s' (%s) โดยมีสถานะส่งล่าช้า: %v", wl.Title, attachmentInfo, isLate),
	}
	tx.Create(&log)

	tx.Commit()

	telegramMessage := fmt.Sprintf(
		"🔔 <b>ส่งภาระงานกลุ่มใหม่!</b>\n\n"+
			"<b>กลุ่ม:</b> %s\n"+
			"<b>ห้องเรียน:</b> %s\n"+
			"<b>หัวข้อ:</b> %s\n"+
			"<b>ภาระงาน:</b> %s (งานกลุ่ม)\n"+
			"<b>ผู้ส่ง:</b> %s\n"+
			"<b>เวลาที่ส่ง:</b> %s%s\n"+
			"<b>%s:</b> %s",
		group.Name, group.Classroom.Name, group.ProjectTopic, wl.Title, user.FullName,
		time.Now().Format("02-01-2006 15:04"), lateText, attachLabel, attachVal,
	)
	telegram.NotifyAdmin(telegramMessage)
	telegram.NotifyStudent(telegramMessage)

	return c.JSON(submission)
}

func GetMySubmissions(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, err := getActiveSemesterID()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// 1. Fetch individual submissions by this student
	var individualSubs []models.Submission
	config.DB.
		Preload("Workload").
		Preload("Grade.GradedBy").
		Joins("JOIN workloads ON workloads.id = submissions.workload_id").
		Where("submissions.student_id = ? AND submissions.group_id IS NULL AND workloads.semester_id = ?", userID, semesterID).
		Find(&individualSubs)

	// 2. Fetch group submissions if student belongs to a group
	var groupSubs []models.Submission
	group, _ := getStudentGroup(userID, semesterID)
	if group != nil {
		config.DB.
			Preload("Workload").
			Preload("Grade.GradedBy").
			Preload("SubmittedBy").
			Where("submissions.group_id = ?", group.ID).
			Find(&groupSubs)
	}

	return c.JSON(fiber.Map{
		"individual_submissions": individualSubs,
		"group_submissions":      groupSubs,
	})
}

// ==========================================
// FINAL PROJECT SUBMISSION
// ==========================================

type SubmitFinalInput struct {
	VideoPath string `json:"video_path"`
	VideoLink string `json:"video_link"`
}

// Helper to parse setting time string
func parseSettingTime(val string) (time.Time, error) {
	if val == "" {
		return time.Time{}, errors.New("empty time string")
	}
	t, err := time.ParseInLocation("2006-01-02T15:04", val, time.Local)
	if err == nil {
		return t, nil
	}
	t, err = time.Parse(time.RFC3339, val)
	if err == nil {
		return t, nil
	}
	t, err = time.ParseInLocation("2006-01-02", val, time.Local)
	if err == nil {
		return t, nil
	}
	return time.Time{}, err
}

func SubmitFinalProject(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, _ := getActiveSemesterID()

	group, err := getStudentGroup(userID, semesterID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "You don't belong to any group"})
	}

	// Check Final Project submission period settings
	var enabledSetting, startSetting, endSetting models.SystemSetting
	config.DB.Where("setting_key = ?", "final_project_enabled").First(&enabledSetting)
	if enabledSetting.SettingValue == "false" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ระบบปิดรับการส่ง Final Project ในขณะนี้"})
	}

	now := time.Now()

	config.DB.Where("setting_key = ?", "final_project_start_time").First(&startSetting)
	if startSetting.SettingValue != "" {
		startTime, err := parseSettingTime(startSetting.SettingValue)
		if err == nil && now.Before(startTime) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": fmt.Sprintf("ยังไม่ถึงกำหนดเวลาเปิดรับการส่ง Final Project (เปิดรับตั้งแต่ %s น.)", startTime.Format("02/01/2006 15:04")),
			})
		}
	}

	config.DB.Where("setting_key = ?", "final_project_end_time").First(&endSetting)
	if endSetting.SettingValue != "" {
		endTime, err := parseSettingTime(endSetting.SettingValue)
		if err == nil && now.After(endTime) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": fmt.Sprintf("ระบบปิดรับการส่ง Final Project แล้ว (สิ้นสุดเวลาเมื่อ %s น.)", endTime.Format("02/01/2006 15:04")),
			})
		}
	}

	input := new(SubmitFinalInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var finalSub models.FinalProjectSubmission
	err = config.DB.Where("group_id = ?", group.ID).First(&finalSub).Error

	var user models.User
	config.DB.First(&user, userID)

	tx := config.DB.Begin()

	if err == gorm.ErrRecordNotFound {
		finalSub = models.FinalProjectSubmission{
			GroupID:       group.ID,
			VideoPath:     input.VideoPath,
			VideoLink:     input.VideoLink,
			SubmittedByID: userID,
			SubmittedAt:   time.Now(),
		}
		tx.Create(&finalSub)
	} else {
		finalSub.VideoPath = input.VideoPath
		finalSub.VideoLink = input.VideoLink
		finalSub.SubmittedByID = userID
		finalSub.SubmittedAt = time.Now()
		tx.Save(&finalSub)
	}

	// Log activity
	finalAttachment := ""
	if finalSub.VideoLink != "" {
		finalAttachment = fmt.Sprintf("ลิงก์วิดีโอ: %s", finalSub.VideoLink)
	} else if finalSub.VideoPath != "" {
		finalAttachment = fmt.Sprintf("ไฟล์วิดีโอ: %s", finalSub.VideoPath)
	}

	log := models.GroupActivityLog{
		GroupID:     group.ID,
		ActionByID:  userID,
		ActionType:  "FINAL_SUBMISSION",
		Description: fmt.Sprintf("อัปโหลด/ส่ง Final Project (%s)", finalAttachment),
	}
	tx.Create(&log)

	tx.Commit()

	// Telegram Notification
	finalLabel := "ลิงก์นำเสนอ"
	finalVal := finalSub.VideoLink
	if finalVal == "" && finalSub.VideoPath != "" {
		finalLabel = "ไฟล์วิดีโอนำเสนอ"
		finalVal = finalSub.VideoPath
	}

	telegramMessage := fmt.Sprintf(
		"🎓 <b>ส่งชิ้นงาน Final Project แล้ว!</b>\n\n"+
			"<b>กลุ่ม:</b> %s\n"+
			"<b>ห้องเรียน:</b> %s\n"+
			"<b>หัวข้องาน:</b> %s\n"+
			"<b>ผู้ส่ง:</b> %s\n"+
			"<b>เวลาส่ง:</b> %s\n"+
			"<b>%s:</b> %s",
		group.Name, group.Classroom.Name, group.ProjectTopic, user.FullName,
		time.Now().Format("02-01-2006 15:04"), finalLabel, finalVal,
	)
	telegram.NotifyAdmin(telegramMessage)
	telegram.NotifyStudent(telegramMessage)

	return c.JSON(finalSub)
}

// GetClassmates lists all classmates in a classroom (defaults to current student's classroom) and indicates if they have a group
func GetClassmates(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	semesterID, err := getActiveSemesterID()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// 1. Fetch current student's classroom to use as default
	var student models.Student
	if err := config.DB.Where("user_id = ?", userID).First(&student).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "You are not registered as a student"})
	}

	// Determine classroom ID
	classroomIDStr := c.Query("classroom_id")
	var targetClassroomID uint
	if classroomIDStr != "" {
		id, err := strconv.Atoi(classroomIDStr)
		if err == nil {
			targetClassroomID = uint(id)
		}
	}
	if targetClassroomID == 0 {
		targetClassroomID = student.ClassroomID
	}

	// 2. Fetch all students in the target classroom, preload their User info
	var classmates []models.Student
	err = config.DB.
		Preload("User").
		Where("classroom_id = ? AND user_id != ?", targetClassroomID, userID).
		Find(&classmates).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch classmates"})
	}

	// 3. Find students already in a group this semester
	var groupedStudentIDs []uint
	err = config.DB.Table("group_members").
		Joins("JOIN groups ON groups.id = group_members.group_id").
		Where("groups.semester_id = ?", semesterID).
		Pluck("group_members.student_id", &groupedStudentIDs).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch group status"})
	}

	isGrouped := make(map[uint]bool)
	for _, id := range groupedStudentIDs {
		isGrouped[id] = true
	}

	// Format response
	type ClassmateResponse struct {
		UserID   uint   `json:"user_id"`
		FullName string `json:"full_name"`
		Username string `json:"username"`
		HasGroup bool   `json:"has_group"`
	}

	var response []ClassmateResponse
	for _, cm := range classmates {
		response = append(response, ClassmateResponse{
			UserID:   cm.UserID,
			FullName: cm.User.FullName,
			Username: cm.User.Username,
			HasGroup: isGrouped[cm.UserID],
		})
	}

	return c.JSON(response)
}

// GetStudentClassrooms lists all classrooms in the selected or active semester
func GetStudentClassrooms(c *fiber.Ctx) error {
	semesterIDStr := c.Query("semester_id")
	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		var err error
		semesterID, err = getActiveSemesterID()
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
	}

	var classrooms []models.Classroom
	query := config.DB
	if semesterID > 0 {
		query = query.Where("semester_id = ?", semesterID)
	}
	err := query.Order("name asc").Find(&classrooms).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch classrooms"})
	}

	return c.JSON(classrooms)
}


