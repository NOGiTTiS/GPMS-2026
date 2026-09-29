package controllers

import (
	"log"
	"strconv"
	"strings"

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
	var users []models.User
	query := config.DB.Order("id asc")
	if role != "" {
		query = query.Where("role = ?", role)
	}
	if err := query.Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Fetch student classroom associations
	var students []models.Student
	config.DB.Preload("Classroom").Find(&students)
	studentMap := make(map[uint]models.Student)
	for _, s := range students {
		studentMap[s.UserID] = s
	}

	// Fetch teacher classroom associations to show classrooms they teach
	type ClassroomTeacher struct {
		ClassroomID uint
		UserID      uint
		ClassName   string
	}
	var classTeachers []ClassroomTeacher
	config.DB.Table("classroom_teachers").
		Select("classroom_teachers.user_id, classroom_teachers.classroom_id, classrooms.name as class_name").
		Joins("join classrooms on classrooms.id = classroom_teachers.classroom_id").
		Scan(&classTeachers)
	
	teacherMap := make(map[uint][]string)
	for _, ct := range classTeachers {
		teacherMap[ct.UserID] = append(teacherMap[ct.UserID], ct.ClassName)
	}

	response := make([]UserResponse, len(users))
	for i, u := range users {
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
		response[i] = res
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

	var activeSem models.Semester
	var activeSemID uint
	if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
		activeSemID = activeSem.ID
	}

	classroomCache := make(map[string]uint)
	if activeSemID > 0 {
		var classrooms []models.Classroom
		config.DB.Where("semester_id = ?", activeSemID).Find(&classrooms)
		for _, cr := range classrooms {
			classroomCache[cr.Name] = cr.ID
		}
	}

	tx := config.DB.Begin()
	importedCount := 0
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
		importedCount++
	}
	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction: " + err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "imported": importedCount})
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

func CreateWorkload(c *fiber.Ctx) error {
	wl := new(models.Workload)
	if err := c.BodyParser(wl); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Auto associate active semester if zero
	if wl.SemesterID == 0 {
		var activeSem models.Semester
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			wl.SemesterID = activeSem.ID
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No active semester found"})
		}
	}

	if err := config.DB.Create(wl).Error; err != nil {
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

	updated := new(models.Workload)
	if err := c.BodyParser(updated); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	wl.Title = updated.Title
	wl.Description = updated.Description
	wl.Deadline = updated.Deadline
	wl.MaxScore = updated.MaxScore
	wl.SampleFilePath = updated.SampleFilePath
	wl.SampleLinkURL = updated.SampleLinkURL

	config.DB.Save(&wl)
	return c.JSON(wl)
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
