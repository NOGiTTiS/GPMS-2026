package controllers

import (
	"fmt"
	"path/filepath"
	"time"

	"github.com/gofiber/fiber/v2"
)

// UploadFile handles file upload and returns the static file path
func UploadFile(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded or invalid form key 'file'"})
	}

	// Create unique name to prevent conflicts
	ext := filepath.Ext(file.Filename)
	uniqueName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	
	savePath := filepath.Join("./uploads", uniqueName)

	// Save to folder
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file: " + err.Error()})
	}

	// Return static file URL path (accessible via Static serving)
	fileURL := fmt.Sprintf("/uploads/%s", uniqueName)
	return c.JSON(fiber.Map{
		"url":      fileURL,
		"filename": file.Filename,
	})
}
