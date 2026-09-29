package config

import (
	"fmt"
	"log"
	"os"

	"gpms-backend/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() *gorm.DB {
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "postgres")
	password := getEnv("DB_PASSWORD", "postgres")
	dbname := getEnv("DB_NAME", "gpms")

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=Asia/Bangkok", host, port, user, password, dbname)

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})

	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	log.Println("Database connection established successfully")

	// Auto Migration
	err = DB.AutoMigrate(
		&models.User{},
		&models.Semester{},
		&models.Classroom{},
		&models.Student{},
		&models.Group{},
		&models.GroupMember{},
		&models.GroupActivityLog{},
		&models.Workload{},
		&models.Submission{},
		&models.WorkloadGrade{},
		&models.FinalProjectSubmission{},
		&models.FinalProjectCriteria{},
		&models.FinalProjectGrade{},
		&models.SystemSetting{},
	)

	if err != nil {
		log.Fatalf("Database migration failed: %v", err)
	}

	log.Println("Database migration completed")

	// Seed Admin and default configurations
	seedData()

	return DB
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func seedData() {
	// 1. Seed Admin User
	var count int64
	DB.Model(&models.User{}).Where("role = ?", models.RoleAdmin).Count(&count)
	if count == 0 {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte("admin1234"), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Failed to hash admin password: %v", err)
			return
		}

		admin := models.User{
			Username:     "admin",
			PasswordHash: string(hashedPassword),
			FullName:     "System Administrator",
			Email:        "admin@gpms.com",
			Role:         models.RoleAdmin,
		}

		if err := DB.Create(&admin).Error; err != nil {
			log.Printf("Failed to seed admin: %v", err)
		} else {
			log.Println("Default Admin seeded: username: admin, password: admin1234")
		}
	}

	// 2. Seed Default Settings
	settings := []models.SystemSetting{
		{SettingKey: "system_name", SettingValue: "GPMS : Group Project Management System"},
		{SettingKey: "system_description", SettingValue: "ระบบบริหารจัดการการส่งงานกลุ่มในชั้นเรียน"},
		{SettingKey: "footer_text", SettingValue: "© 2026 GPMS. All Rights Reserved."},
		{SettingKey: "institution_name", SettingValue: "สถาบันการศึกษาตัวอย่าง"},
		{SettingKey: "logo_path", SettingValue: ""},
		{SettingKey: "favicon_path", SettingValue: ""},
		{SettingKey: "color_primary", SettingValue: "#D81B60"},      // Triam Udom Pink
		{SettingKey: "color_secondary", SettingValue: "#1e293b"},    // Slate 800
		{SettingKey: "color_bg_start", SettingValue: "#f8fafc"},     // Slate 50
		{SettingKey: "color_bg_end", SettingValue: "#f1f5f9"},       // Slate 100
		{SettingKey: "telegram_token", SettingValue: ""},
		{SettingKey: "telegram_admin_group", SettingValue: ""},
		{SettingKey: "telegram_student_group", SettingValue: ""},
		{SettingKey: "notify_admin", SettingValue: "false"},
		{SettingKey: "notify_student", SettingValue: "false"},
		{SettingKey: "popup_active", SettingValue: "false"},
		{SettingKey: "popup_content", SettingValue: "ยินดีต้อนรับสู่ระบบ GPMS กรุณาตรวจสอบปฏิทินส่งงานของท่าน"},
		{SettingKey: "max_group_members", SettingValue: "5"},
	}

	for _, setting := range settings {
		var existing models.SystemSetting
		if err := DB.Where("setting_key = ?", setting.SettingKey).First(&existing).Error; err != nil {
			// Setting not found, create it
			DB.Create(&setting)
		}
	}
	log.Println("Default system settings seeded or updated")

	// 3. Seed Default Semester if none exists
	var semCount int64
	DB.Model(&models.Semester{}).Count(&semCount)
	if semCount == 0 {
		defaultSem := models.Semester{
			Year:     2569,
			Term:     1,
			IsActive: true,
		}
		DB.Create(&defaultSem)
		log.Println("Default Semester seeded (2569/1)")
	}
}
