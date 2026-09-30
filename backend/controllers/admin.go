package controllers

import (
	"log"
	"strconv"
	"strings"
	"time"

	"gpms-backend/config"
	"gpms-backend/models"

	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"
	"golang.org/x/crypto/bcrypt"
)

// ==========================================
// SEMESTERS
// ==========================================

func GetSemesters(c *fiber.Ctx) error {
	var semesters []models.Semester
	config.DB.Order("year desc, term desc").Find(&semesters)
	return c.JSON(semesters)
}

func CreateSemester(c *fiber.Ctx) error {
	sem := new(models.Semester)
	if err := c.BodyParser(sem); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if sem.IsActive {
		// Set other semesters to false
		config.DB.Model(&models.Semester{}).Where("1 = 1").Update("is_active", false)
	}

	if err := config.DB.Create(sem).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(sem)
}

func UpdateSemester(c *fiber.Ctx) error {
	id := c.Params("id")
	var sem models.Semester
	if err := config.DB.First(&sem, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Semester not found"})
	}

	updated := new(models.Semester)
	if err := c.BodyParser(updated); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	sem.Year = updated.Year
	sem.Term = updated.Term
	sem.IsActive = updated.IsActive

	if sem.IsActive {
		config.DB.Model(&models.Semester{}).Where("id != ?", sem.ID).Update("is_active", false)
	}

	config.DB.Save(&sem)
	return c.JSON(sem)
}

func DeleteSemester(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := config.DB.Delete(&models.Semester{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

type CloneSemesterInput struct {
	SourceSemesterID uint `json:"source_semester_id"`
	CloneClassrooms  bool `json:"clone_classrooms"`
	CloneTeachers    bool `json:"clone_teachers"`
	CloneWorkloads   bool `json:"clone_workloads"`
	CloneCriteria    bool `json:"clone_criteria"`
}

func CloneSemesterStructure(c *fiber.Ctx) error {
	targetSemesterIDStr := c.Params("id")
	targetSemID, err := strconv.Atoi(targetSemesterIDStr)
	if err != nil || targetSemID <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid target semester ID"})
	}

	input := new(CloneSemesterInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if input.SourceSemesterID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Source semester ID is required"})
	}

	if uint(targetSemID) == input.SourceSemesterID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Source and target semester cannot be the same"})
	}

	var sourceSem, targetSem models.Semester
	if err := config.DB.First(&sourceSem, input.SourceSemesterID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Source semester not found"})
	}
	if err := config.DB.First(&targetSem, targetSemID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Target semester not found"})
	}

	tx := config.DB.Begin()

	clonedClassroomsCount := 0
	clonedWorkloadsCount := 0
	clonedCriteriaCount := 0

	// 1. Clone Classrooms
	if input.CloneClassrooms {
		var sourceClassrooms []models.Classroom
		tx.Preload("Teachers").Where("semester_id = ?", sourceSem.ID).Find(&sourceClassrooms)

		for _, sc := range sourceClassrooms {
			var existing models.Classroom
			if err := tx.Where("semester_id = ? AND name = ?", targetSem.ID, sc.Name).First(&existing).Error; err != nil {
				newClass := models.Classroom{
					Name:       sc.Name,
					SemesterID: targetSem.ID,
				}
				if err := tx.Create(&newClass).Error; err != nil {
					tx.Rollback()
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to clone classroom: " + err.Error()})
				}
				clonedClassroomsCount++

				if input.CloneTeachers && len(sc.Teachers) > 0 {
					tx.Model(&newClass).Association("Teachers").Replace(&sc.Teachers)
				}
			} else {
				if input.CloneTeachers && len(sc.Teachers) > 0 {
					tx.Model(&existing).Association("Teachers").Replace(&sc.Teachers)
				}
			}
		}
	}

	// 2. Clone Workloads
	if input.CloneWorkloads {
		var sourceWorkloads []models.Workload
		tx.Where("semester_id = ?", sourceSem.ID).Find(&sourceWorkloads)

		for _, sw := range sourceWorkloads {
			var existing models.Workload
			if err := tx.Where("semester_id = ? AND title = ?", targetSem.ID, sw.Title).First(&existing).Error; err != nil {
				defaultDeadline := time.Now().AddDate(0, 1, 0)
				newWl := models.Workload{
					SemesterID:     targetSem.ID,
					Title:          sw.Title,
					Description:    sw.Description,
					Deadline:       defaultDeadline,
					MaxScore:       sw.MaxScore,
					SampleFilePath: sw.SampleFilePath,
					SampleLinkURL:  sw.SampleLinkURL,
					Type:           sw.Type,
					IsOpen:         true,
					AllowLate:      sw.AllowLate,
					CreatedAt:      time.Now(),
				}
				if err := tx.Create(&newWl).Error; err != nil {
					tx.Rollback()
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to clone workload: " + err.Error()})
				}
				clonedWorkloadsCount++
			}
		}
	}

	// 3. Clone Criteria
	if input.CloneCriteria {
		var sourceCriteria []models.FinalProjectCriteria
		tx.Where("semester_id = ?", sourceSem.ID).Find(&sourceCriteria)

		for _, sc := range sourceCriteria {
			var existing models.FinalProjectCriteria
			if err := tx.Where("semester_id = ? AND title = ?", targetSem.ID, sc.Title).First(&existing).Error; err != nil {
				newCrit := models.FinalProjectCriteria{
					SemesterID: targetSem.ID,
					Title:      sc.Title,
					MaxScore:   sc.MaxScore,
					Weight:     sc.Weight,
				}
				if err := tx.Create(&newCrit).Error; err != nil {
					tx.Rollback()
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to clone criteria: " + err.Error()})
				}
				clonedCriteriaCount++
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit cloning transaction"})
	}

	return c.JSON(fiber.Map{
		"status":            "success",
		"message":           "Structure cloned successfully",
		"cloned_classrooms": clonedClassroomsCount,
		"cloned_workloads":  clonedWorkloadsCount,
		"cloned_criteria":   clonedCriteriaCount,
	})
}

// ==========================================
// USERS
// ==========================================

type UserCreateInput struct {
	Username    string          `json:"username"`
	Password    string          `json:"password"`
	FullName    string          `json:"full_name"`
	Email       string          `json:"email"`
	Role        models.UserRole `json:"role"`
	ClassroomID uint            `json:"classroom_id"` // for student role
}

type UserResponse struct {
	models.User
	ClassroomID   uint   `json:"classroom_id,omitempty"`
	ClassroomName string `json:"classroom_name,omitempty"`
}

func GetUsers(c *fiber.Ctx) error {
	role := c.Query("role")
	semesterIDStr := c.Query("semester_id")

	var targetSemesterID uint
	if semesterIDStr != "" && semesterIDStr != "all" {
		if id, err := strconv.Atoi(semesterIDStr); err == nil {
			targetSemesterID = uint(id)
		}
	}

	// Fetch student classroom associations
	var students []models.Student
	studentQuery := config.DB.Preload("Classroom")
	if targetSemesterID > 0 {
		studentQuery = studentQuery.Joins("JOIN classrooms ON classrooms.id = students.classroom_id").
			Where("classrooms.semester_id = ?", targetSemesterID)
	}
	studentQuery.Find(&students)
	studentMap := make(map[uint]models.Student)
	targetStudentUserIDs := make(map[uint]bool)
	for _, s := range students {
		studentMap[s.UserID] = s
		targetStudentUserIDs[s.UserID] = true
	}

	var users []models.User
	query := config.DB.Order("id asc")
	if role != "" {
		query = query.Where("role = ?", role)
	}
	if err := query.Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Fetch teacher classroom associations to show classrooms they teach
	type ClassroomTeacher struct {
		ClassroomID uint
		UserID      uint
		ClassName   string
	}
	var classTeachers []ClassroomTeacher
	queryTeachers := config.DB.Table("classroom_teachers").
		Select("classroom_teachers.user_id, classroom_teachers.classroom_id, classrooms.name as class_name").
		Joins("join classrooms on classrooms.id = classroom_teachers.classroom_id")
	if targetSemesterID > 0 {
		queryTeachers = queryTeachers.Where("classrooms.semester_id = ?", targetSemesterID)
	}
	queryTeachers.Scan(&classTeachers)
	
	teacherMap := make(map[uint][]string)
	for _, ct := range classTeachers {
		teacherMap[ct.UserID] = append(teacherMap[ct.UserID], ct.ClassName)
	}

	var response []UserResponse
	for _, u := range users {
		// If filtering by semester, only include students who are enrolled in that semester's classrooms!
		if targetSemesterID > 0 && u.Role == models.RoleStudent {
			if !targetStudentUserIDs[u.ID] {
				continue
			}
		}

		res := UserResponse{User: u}
		if u.Role == models.RoleStudent {
			if s, ok := studentMap[u.ID]; ok {
				res.ClassroomID = s.ClassroomID
				res.ClassroomName = s.Classroom.Name
			}
		} else if u.Role == models.RoleTeacher {
			if names, ok := teacherMap[u.ID]; ok {
				var classList string
				for idx, name := range names {
					if idx > 0 {
						classList += ", "
					}
					classList += name
				}
				res.ClassroomName = classList
			}
		}
		response = append(response, res)
	}

	if response == nil {
		response = []UserResponse{}
	}

	return c.JSON(response)
}

func CreateUser(c *fiber.Ctx) error {
	input := new(UserCreateInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	username := strings.TrimSpace(input.Username)
	password := strings.TrimSpace(input.Password)
	fullName := strings.TrimSpace(input.FullName)
	email := strings.TrimSpace(input.Email)

	if username == "" || password == "" || fullName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Username, Password, and Full Name are required"})
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	user := models.User{
		Username:     username,
		PasswordHash: string(hashedPassword),
		FullName:     fullName,
		Email:        email,
		Role:         input.Role,
	}

	tx := config.DB.Begin()
	if err := tx.Create(&user).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Username might already exist or invalid data"})
	}

	if user.Role == models.RoleStudent && input.ClassroomID > 0 {
		student := models.Student{
			UserID:      user.ID,
			ClassroomID: input.ClassroomID,
		}
		if err := tx.Create(&student).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to assign student to classroom"})
		}
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction: " + err.Error()})
	}
	return c.JSON(user)
}

func ImportUsers(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to open file"})
	}
	defer src.Close()

	f, err := excelize.OpenReader(src)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid Excel file format"})
	}
	defer func() {
		if err := f.Close(); err != nil {
			log.Println(err)
		}
	}()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No sheets found in Excel file"})
	}
	sheetName := sheets[0]

	rows, err := f.GetRows(sheetName)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to read rows"})
	}

	semesterIDStr := c.Query("semester_id")
	var targetSemID uint
	if semesterIDStr != "" && semesterIDStr != "all" {
		if id, err := strconv.Atoi(semesterIDStr); err == nil {
			targetSemID = uint(id)
		}
	}
	if targetSemID == 0 {
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			targetSemID = activeSem.ID
		}
	}

	classroomCache := make(map[string]uint)
	if targetSemID > 0 {
		var classrooms []models.Classroom
		config.DB.Where("semester_id = ?", targetSemID).Find(&classrooms)
		for _, cr := range classrooms {
			classroomCache[cr.Name] = cr.ID
		}
	}

	tx := config.DB.Begin()
	importedCount := 0
	createdCount := 0
	updatedCount := 0

	for idx, row := range rows {
		if idx == 0 {
			// Skip header row
			continue
		}
		if len(row) == 0 {
			continue
		}

		username := ""
		if len(row) > 0 {
			username = strings.TrimSpace(row[0])
		}
		if username == "" {
			continue
		}

		password := ""
		if len(row) > 1 {
			password = strings.TrimSpace(row[1])
		}
		if password == "" {
			password = "password1234"
		}

		fullName := ""
		if len(row) > 2 {
			fullName = strings.TrimSpace(row[2])
		}
		if fullName == "" {
			continue
		}

		email := ""
		if len(row) > 3 {
			email = strings.TrimSpace(row[3])
		}

		roleStr := ""
		if len(row) > 4 {
			roleStr = strings.TrimSpace(row[4])
		}
		role := models.UserRole(roleStr)
		if role != models.RoleAdmin && role != models.RoleTeacher && role != models.RoleStudent {
			role = models.RoleStudent
		}

		classroomName := ""
		if len(row) > 5 {
			classroomName = strings.TrimSpace(row[5])
		}

		var classroomID uint
		if role == models.RoleStudent && classroomName != "" {
			if id, ok := classroomCache[classroomName]; ok {
				classroomID = id
			}
		}

		var existingUser models.User
		if err := tx.Where("LOWER(username) = LOWER(?)", username).First(&existingUser).Error; err == nil {
			// User already exists -> Smart Upsert
			existingUser.FullName = fullName
			if email != "" {
				existingUser.Email = email
			}
			if password != "password1234" && password != "" {
				if hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost); err == nil {
					existingUser.PasswordHash = string(hashed)
				}
			}
			tx.Save(&existingUser)

			if existingUser.Role == models.RoleStudent && classroomID > 0 {
				var student models.Student
				if err := tx.Where("user_id = ?", existingUser.ID).First(&student).Error; err == nil {
					student.ClassroomID = classroomID
					tx.Save(&student)
				} else {
					student = models.Student{
						UserID:      existingUser.ID,
						ClassroomID: classroomID,
					}
					tx.Create(&student)
				}
			}
			updatedCount++
			importedCount++
		} else {
			// New User
			hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
			if err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
			}

			user := models.User{
				Username:     username,
				PasswordHash: string(hashedPassword),
				FullName:     fullName,
				Email:        email,
				Role:         role,
			}

			if err := tx.Create(&user).Error; err != nil {
				continue
			}

			if user.Role == models.RoleStudent && classroomID > 0 {
				student := models.Student{
					UserID:      user.ID,
					ClassroomID: classroomID,
				}
				tx.Create(&student)
			}
			createdCount++
			importedCount++
		}
	}
	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"status":   "success",
		"imported": importedCount,
		"created":  createdCount,
		"updated":  updatedCount,
	})
}

func DownloadImportTemplate(c *fiber.Ctx) error {
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Println(err)
		}
	}()

	sheetName := "Template"
	f.SetSheetName("Sheet1", sheetName)

	headers := []string{"Username (ชื่อผู้ใช้งาน)*", "Password (รหัสผ่าน)", "Full Name (ชื่อ-นามสกุล)*", "Email (อีเมล)", "Role (บทบาท)*", "Classroom Name (ชื่อห้องเรียน)"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
	}

	samples := [][]interface{}{
		{"student01", "pass1234", "นายสมชาย ใจดี", "somchai@email.com", "student", "ม.6/1"},
		{"teacher01", "pass5678", "นางสาวสมศรี เรียนดี", "somsri@email.com", "teacher", ""},
		{"admin02", "", "นายสมยศ ผู้ดูแลระบบ", "somyot@email.com", "admin", ""},
	}

	for rIdx, row := range samples {
		for cIdx, val := range row {
			cell, _ := excelize.CoordinatesToCellName(cIdx+1, rIdx+2)
			f.SetCellValue(sheetName, cell, val)
		}
	}

	// Auto-fit column widths
	cols, err := f.GetCols(sheetName)
	if err == nil {
		for i, col := range cols {
			maxLen := 0
			for _, val := range col {
				if len(val) > maxLen {
					maxLen = len(val)
				}
			}
			colName, err := excelize.ColumnNumberToName(i + 1)
			if err == nil {
				width := float64(maxLen) * 1.2
				if width < 15 {
					width = 15
				}
				f.SetColWidth(sheetName, colName, colName, width)
			}
		}
	}

	c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set("Content-Disposition", "attachment; filename=user_import_template.xlsx")

	buffer, err := f.WriteToBuffer()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate template"})
	}

	return c.Send(buffer.Bytes())
}

func UpdateUser(c *fiber.Ctx) error {
	id := c.Params("id")
	var user models.User
	if err := config.DB.First(&user, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	type UserUpdateInput struct {
		Password    string `json:"password"`
		FullName    string `json:"full_name"`
		Email       string `json:"email"`
		ClassroomID uint   `json:"classroom_id"`
	}

	input := new(UserUpdateInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	fullName := strings.TrimSpace(input.FullName)
	email := strings.TrimSpace(input.Email)

	if fullName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Full Name is required"})
	}

	user.FullName = fullName
	user.Email = email

	password := strings.TrimSpace(input.Password)
	if password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
		}
		user.PasswordHash = string(hashed)
	}

	tx := config.DB.Begin()
	if err := tx.Save(&user).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update user: " + err.Error()})
	}

	if user.Role == models.RoleStudent && input.ClassroomID > 0 {
		var student models.Student
		if err := tx.Where("user_id = ?", user.ID).First(&student).Error; err == nil {
			student.ClassroomID = input.ClassroomID
			if err := tx.Save(&student).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update student classroom: " + err.Error()})
			}
		} else {
			student = models.Student{
				UserID:      user.ID,
				ClassroomID: input.ClassroomID,
			}
			if err := tx.Create(&student).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to assign student classroom: " + err.Error()})
			}
		}
	}
	
	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction: " + err.Error()})
	}

	return c.JSON(user)
}

func DeleteUser(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := config.DB.Delete(&models.User{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

// ==========================================
// CLASSROOMS
// ==========================================

func GetClassrooms(c *fiber.Ctx) error {
	semesterIDStr := c.Query("semester_id")
	var classrooms []models.Classroom
	query := config.DB.Preload("Semester").Preload("Teachers")
	
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		query = query.Where("semester_id = ?", uint(id))
	}
	
	query.Find(&classrooms)
	return c.JSON(classrooms)
}

func CreateClassroom(c *fiber.Ctx) error {
	classroom := new(models.Classroom)
	if err := c.BodyParser(classroom); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if err := config.DB.Create(classroom).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(classroom)
}

func UpdateClassroom(c *fiber.Ctx) error {
	id := c.Params("id")
	var classroom models.Classroom
	if err := config.DB.First(&classroom, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Classroom not found"})
	}

	updated := new(models.Classroom)
	if err := c.BodyParser(updated); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	classroom.Name = updated.Name
	classroom.SemesterID = updated.SemesterID

	if err := config.DB.Save(&classroom).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(classroom)
}


type AssignTeachersInput struct {
	TeacherIDs []uint `json:"teacher_ids"`
}

func AssignTeachersToClassroom(c *fiber.Ctx) error {
	classroomID := c.Params("id")
	var classroom models.Classroom
	if err := config.DB.First(&classroom, classroomID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Classroom not found"})
	}

	input := new(AssignTeachersInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Fetch teachers
	var teachers []models.User
	if len(input.TeacherIDs) > 0 {
		config.DB.Where("id IN ? AND role = ?", input.TeacherIDs, models.RoleTeacher).Find(&teachers)
	}

	// Replace associated teachers
	config.DB.Model(&classroom).Association("Teachers").Replace(&teachers)

	return c.JSON(fiber.Map{"status": "success", "classroom_id": classroom.ID})
}

func DeleteClassroom(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := config.DB.Delete(&models.Classroom{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

// ==========================================
// WORKLOADS
// ==========================================

func GetWorkloads(c *fiber.Ctx) error {
	semesterIDStr := c.Query("semester_id")
	var semesterID uint
	if semesterIDStr != "" {
		id, _ := strconv.Atoi(semesterIDStr)
		semesterID = uint(id)
	} else {
		// get active semester
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			semesterID = activeSem.ID
		}
	}

	var workloads []models.Workload
	config.DB.Where("semester_id = ?", semesterID).Order("deadline asc").Find(&workloads)
	return c.JSON(workloads)
}

type WorkloadInput struct {
	SemesterID     uint                `json:"semester_id"`
	Title          string              `json:"title"`
	Description    string              `json:"description"`
	Deadline       time.Time           `json:"deadline"`
	MaxScore       float64             `json:"max_score"`
	SampleFilePath string              `json:"sample_file_path"`
	SampleLinkURL  string              `json:"sample_link_url"`
	Type           models.WorkloadType `json:"type"`
	IsOpen         *bool               `json:"is_open"`
	AllowLate      *bool               `json:"allow_late"`
}

func CreateWorkload(c *fiber.Ctx) error {
	input := new(WorkloadInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	semesterID := input.SemesterID
	if semesterID == 0 {
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			semesterID = activeSem.ID
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No active semester found"})
		}
	}

	wlType := input.Type
	if wlType == "" {
		wlType = models.WorkloadTypeGroup
	}

	isOpen := true
	if input.IsOpen != nil {
		isOpen = *input.IsOpen
	}

	allowLate := true
	if input.AllowLate != nil {
		allowLate = *input.AllowLate
	}

	wl := models.Workload{
		SemesterID:     semesterID,
		Title:          input.Title,
		Description:    input.Description,
		Deadline:       input.Deadline,
		MaxScore:       input.MaxScore,
		SampleFilePath: input.SampleFilePath,
		SampleLinkURL:  input.SampleLinkURL,
		Type:           wlType,
		IsOpen:         isOpen,
		AllowLate:      allowLate,
		CreatedAt:      time.Now(),
	}

	if err := config.DB.Create(&wl).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(wl)
}

func UpdateWorkload(c *fiber.Ctx) error {
	id := c.Params("id")
	var wl models.Workload
	if err := config.DB.First(&wl, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Workload not found"})
	}

	input := new(WorkloadInput)
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	wl.Title = input.Title
	wl.Description = input.Description
	if !input.Deadline.IsZero() {
		wl.Deadline = input.Deadline
	}
	wl.MaxScore = input.MaxScore
	wl.SampleFilePath = input.SampleFilePath
	wl.SampleLinkURL = input.SampleLinkURL
	if input.Type != "" {
		wl.Type = input.Type
	}
	if input.IsOpen != nil {
		wl.IsOpen = *input.IsOpen
	}
	if input.AllowLate != nil {
		wl.AllowLate = *input.AllowLate
	}

	config.DB.Save(&wl)
	return c.JSON(wl)
}

func ToggleWorkloadOpen(c *fiber.Ctx) error {
	id := c.Params("id")
	var wl models.Workload
	if err := config.DB.First(&wl, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Workload not found"})
	}

	wl.IsOpen = !wl.IsOpen
	if err := config.DB.Save(&wl).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "is_open": wl.IsOpen, "workload": wl})
}

func DeleteWorkload(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := config.DB.Delete(&models.Workload{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

// ==========================================
// FINAL PROJECT CRITERIA
// ==========================================

func GetCriteria(c *fiber.Ctx) error {
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

	var criteria []models.FinalProjectCriteria
	config.DB.Where("semester_id = ?", semesterID).Find(&criteria)
	return c.JSON(criteria)
}

func CreateCriteria(c *fiber.Ctx) error {
	crit := new(models.FinalProjectCriteria)
	if err := c.BodyParser(crit); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if crit.SemesterID == 0 {
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			crit.SemesterID = activeSem.ID
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No active semester found"})
		}
	}

	if err := config.DB.Create(crit).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(crit)
}

func UpdateCriteria(c *fiber.Ctx) error {
	id := c.Params("id")
	var crit models.FinalProjectCriteria
	if err := config.DB.First(&crit, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Criteria not found"})
	}

	updated := new(models.FinalProjectCriteria)
	if err := c.BodyParser(updated); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	crit.Title = updated.Title
	crit.MaxScore = updated.MaxScore
	crit.Weight = updated.Weight

	config.DB.Save(&crit)
	return c.JSON(crit)
}

func DeleteCriteria(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := config.DB.Delete(&models.FinalProjectCriteria{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

// ==========================================
// SYSTEM SETTINGS
// ==========================================

func GetSettings(c *fiber.Ctx) error {
	var settings []models.SystemSetting
	config.DB.Find(&settings)

	res := make(map[string]string)
	for _, setting := range settings {
		res[setting.SettingKey] = setting.SettingValue
	}
	return c.JSON(res)
}

func UpdateSettings(c *fiber.Ctx) error {
	var input map[string]string
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	for key, value := range input {
		setting := models.SystemSetting{
			SettingKey:   key,
			SettingValue: value,
		}
		config.DB.Save(&setting)
	}

	return c.JSON(fiber.Map{"status": "success"})
}
