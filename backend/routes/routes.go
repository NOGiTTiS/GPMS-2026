package routes

import (
	"gpms-backend/controllers"
	"gpms-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

type roleGroup struct {
	router fiber.Router
	role   fiber.Handler
}

func (rg *roleGroup) Get(path string, handlers ...fiber.Handler) fiber.Router {
	return rg.router.Get(path, append([]fiber.Handler{rg.role}, handlers...)...)
}

func (rg *roleGroup) Post(path string, handlers ...fiber.Handler) fiber.Router {
	return rg.router.Post(path, append([]fiber.Handler{rg.role}, handlers...)...)
}

func (rg *roleGroup) Put(path string, handlers ...fiber.Handler) fiber.Router {
	return rg.router.Put(path, append([]fiber.Handler{rg.role}, handlers...)...)
}

func (rg *roleGroup) Delete(path string, handlers ...fiber.Handler) fiber.Router {
	return rg.router.Delete(path, append([]fiber.Handler{rg.role}, handlers...)...)
}

func SetupRoutes(app *fiber.App) {
	api := app.Group("/api")

	// Public Routes
	api.Post("/auth/login", controllers.Login)
	api.Get("/settings", controllers.GetSettings) // Dynamic system configs (colors, logo, title)

	// Authenticated Routes
	auth := api.Use(middleware.AuthRequired)

	// Profile route
	auth.Get("/auth/profile", controllers.GetProfile)
	auth.Put("/auth/profile", controllers.UpdateProfile)

	// File Upload Route
	auth.Post("/upload", controllers.UploadFile)

	// Dashboard & Reports (accessible by all roles with internal filtering)
	auth.Get("/dashboard/stats", controllers.GetDashboardStats)
	auth.Get("/dashboard/report", controllers.GetReportData)
	auth.Get("/dashboard/workload-overview", controllers.GetWorkloadOverview)
	auth.Get("/dashboard/export/excel", controllers.ExportScoresExcel)

	// Shared Read-only Routes (accessible by students, teachers, and admins)
	auth.Get("/admin/workloads", controllers.GetWorkloads)
	auth.Get("/admin/criteria", controllers.GetCriteria)
	auth.Get("/admin/semesters", controllers.GetSemesters)
	auth.Get("/admin/classrooms", controllers.GetClassrooms)

	// Admin Routes
	admin := &roleGroup{router: auth, role: middleware.RequireRole("admin")}
	
	// Semesters
	admin.Post("/admin/semesters", controllers.CreateSemester)
	admin.Put("/admin/semesters/:id", controllers.UpdateSemester)
	admin.Delete("/admin/semesters/:id", controllers.DeleteSemester)

	// Users
	admin.Get("/admin/users", controllers.GetUsers)
	admin.Post("/admin/users", controllers.CreateUser)
	admin.Get("/admin/users/import/template", controllers.DownloadImportTemplate)
	admin.Post("/admin/users/import", controllers.ImportUsers)
	admin.Put("/api/admin/users/:id", controllers.UpdateUser) // Note: handles endpoint prefixing
	admin.Put("/admin/users/:id", controllers.UpdateUser)
	admin.Delete("/admin/users/:id", controllers.DeleteUser)

	// Classrooms
	admin.Get("/admin/classrooms", controllers.GetClassrooms)
	admin.Post("/admin/classrooms", controllers.CreateClassroom)
	admin.Put("/admin/classrooms/:id", controllers.UpdateClassroom)
	admin.Post("/admin/classrooms/:id/teachers", controllers.AssignTeachersToClassroom)
	admin.Delete("/admin/classrooms/:id", controllers.DeleteClassroom)


	// Workloads
	admin.Post("/admin/workloads", controllers.CreateWorkload)
	admin.Put("/admin/workloads/:id", controllers.UpdateWorkload)
	admin.Delete("/admin/workloads/:id", controllers.DeleteWorkload)

	// Criteria
	admin.Post("/admin/criteria", controllers.CreateCriteria)
	admin.Put("/admin/criteria/:id", controllers.UpdateCriteria)
	admin.Delete("/admin/criteria/:id", controllers.DeleteCriteria)

	// Settings
	admin.Get("/admin/settings", controllers.GetSettings)
	admin.Put("/admin/settings", controllers.UpdateSettings)

	// Student Routes
	student := &roleGroup{router: auth, role: middleware.RequireRole("student")}
	student.Post("/student/groups", controllers.CreateGroup)
	student.Delete("/student/groups", controllers.DeleteGroup)
	student.Post("/student/groups/members", controllers.AddGroupMember)
	student.Delete("/student/groups/members/:studentId", controllers.RemoveGroupMember)
	student.Post("/student/groups/leave", controllers.LeaveGroup)
	student.Put("/student/groups/topic", controllers.UpdateGroupTopic)
	student.Get("/student/groups/my", controllers.GetMyGroup)
	student.Get("/student/classmates", controllers.GetClassmates)
	student.Get("/student/classrooms", controllers.GetStudentClassrooms)
	student.Post("/student/submissions/workload", controllers.SubmitWorkload)
	student.Post("/student/submissions/final", controllers.SubmitFinalProject)

	// Teacher Routes
	teacher := &roleGroup{router: auth, role: middleware.RequireRole("teacher")}
	teacher.Post("/teacher/grade/workload", controllers.GradeWorkload)
	teacher.Post("/teacher/grade/final", controllers.GradeFinalProject)
	teacher.Get("/teacher/classrooms", controllers.GetSupervisedClassrooms)
	teacher.Get("/teacher/groups", controllers.GetSupervisedGroups)
	teacher.Get("/teacher/submissions", controllers.GetSubmissionsToGrade)
	teacher.Get("/teacher/final-projects", controllers.GetFinalProjectsToGrade)
}

