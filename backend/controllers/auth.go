package controllers

import (
	"strings"

	"gpms-backend/config"
	"gpms-backend/models"
	"gpms-backend/utils"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func Login(c *fiber.Ctx) error {
	req := new(LoginRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse JSON body",
		})
	}

	username := strings.TrimSpace(req.Username)
	password := strings.TrimSpace(req.Password)

	var user models.User
	err := config.DB.Where("LOWER(username) = LOWER(?)", username).First(&user).Error
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid username or password",
		})
	}

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid username or password",
		})
	}

	// Generate JWT Token
	token, err := utils.GenerateToken(user.ID, string(user.Role))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to generate token",
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"token": token,
		"user": fiber.Map{
			"id":        user.ID,
			"username":  user.Username,
			"full_name": user.FullName,
			"email":     user.Email,
			"role":      user.Role,
		},
	})
}

func GetProfile(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	res := fiber.Map{
		"id":        user.ID,
		"username":  user.Username,
		"full_name": user.FullName,
		"email":     user.Email,
		"role":      user.Role,
	}

	// If user is a student, find classroom and group info
	if user.Role == models.RoleStudent {
		var activeSem models.Semester
		var activeSemID uint
		if err := config.DB.Where("is_active = ?", true).First(&activeSem).Error; err == nil {
			activeSemID = activeSem.ID
		}

		var student models.Student
		if err := config.DB.Preload("Classroom.Semester").Where("user_id = ?", user.ID).First(&student).Error; err == nil {
			res["classroom"] = student.Classroom
			
			// Find group for active semester
			var groupMember models.GroupMember
			query := config.DB.Table("group_members").
				Joins("JOIN groups ON groups.id = group_members.group_id").
				Where("group_members.student_id = ?", user.ID)

			if activeSemID > 0 {
				query = query.Where("groups.semester_id = ?", activeSemID)
			}

			if err := query.First(&groupMember).Error; err == nil {
				var group models.Group
				if err := config.DB.Preload("Members").First(&group, groupMember.GroupID).Error; err == nil {
					res["group"] = group
				}
			}
		}
	}

	return c.Status(fiber.StatusOK).JSON(res)
}

type ProfileUpdateRequest struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func UpdateProfile(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	req := new(ProfileUpdateRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse JSON body",
		})
	}

	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	fullName := strings.TrimSpace(req.FullName)
	email := strings.TrimSpace(req.Email)

	if fullName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Full Name is required",
		})
	}

	user.FullName = fullName
	user.Email = email

	password := strings.TrimSpace(req.Password)
	if password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to hash password",
			})
		}
		user.PasswordHash = string(hashed)
	}

	if err := config.DB.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update profile",
		})
	}

	// Fetch updated profile with relations
	res := fiber.Map{
		"id":        user.ID,
		"username":  user.Username,
		"full_name": user.FullName,
		"email":     user.Email,
		"role":      user.Role,
	}

	if user.Role == models.RoleStudent {
		var student models.Student
		if err := config.DB.Preload("Classroom.Semester").Where("user_id = ?", user.ID).First(&student).Error; err == nil {
			res["classroom"] = student.Classroom
			
			// Find group
			var groupMember models.GroupMember
			if err := config.DB.Where("student_id = ?", user.ID).First(&groupMember).Error; err == nil {
				var group models.Group
				if err := config.DB.Preload("Members").First(&group, groupMember.GroupID).Error; err == nil {
					res["group"] = group
				}
			}
		}
	}

	return c.Status(fiber.StatusOK).JSON(res)
}
