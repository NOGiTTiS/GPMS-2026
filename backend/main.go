package main

import (
	"log"
	"os"

	"gpms-backend/config"
	"gpms-backend/routes"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	// 1. Initialize Database
	config.InitDB()

	// 2. Initialize Fiber App
	app := fiber.New(fiber.Config{
		AppName: "GPMS API v1.0",
	})

	// 3. Middlewares
	app.Use(logger.New())
	app.Use(recover.New())
	
	// CORS Middleware
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*", // Adjust in production
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, DELETE, OPTIONS",
	}))

	// Static files (for file uploads if we decide to store files locally)
	app.Static("/uploads", "./uploads")

	// Ensure upload directory exists
	if _, err := os.Stat("uploads"); os.IsNotExist(err) {
		err = os.Mkdir("uploads", 0755)
		if err != nil {
			log.Printf("Failed to create uploads directory: %v", err)
		}
	}

	// 4. Setup Routes
	routes.SetupRoutes(app)

	// 5. Start Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server is starting on port %s...", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
