package controllers

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"gpms-backend/config"
	"gpms-backend/models"

	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"
)

// Helper to sanitize Excel sheet name (max 31 chars, no invalid chars \ / ? * [ ] :)
func sanitizeSheetName(name string, existingNames map[string]bool) string {
	replacer := strings.NewReplacer(
		"\\", "_",
		"/", "_",
		"?", "_",
		"*", "_",
		"[", "_",
		"]", "_",
		":", "_",
	)
	cleaned := strings.TrimSpace(replacer.Replace(name))
	if cleaned == "" {
		cleaned = "Sheet"
	}

	runes := []rune(cleaned)
	if len(runes) > 28 {
		cleaned = string(runes[:28])
	}

	candidate := cleaned
	counter := 2
	for existingNames[strings.ToLower(candidate)] {
		candidate = fmt.Sprintf("%s_%d", cleaned, counter)
		counter++
	}
	existingNames[strings.ToLower(candidate)] = true
	return candidate
}

type GroupScoreData struct {
	Group                models.Group
	WorkloadScores       []float64
	WorkloadGraded       []bool
	GradedCount          int
	TotalWorkloads       int
	AccumulatedScore     float64
	FinalCriteriaScores  []float64
	FinalUnweightedScore float64
	FinalProjectScore    float64
	TotalScore           float64
}

// ExportScoresExcel exports checked/graded scores to Excel (.xlsx) separated by classroom and group
func ExportScoresExcel(c *fiber.Ctx) error {
	semesterIDStr := c.Query("semester_id")
	classroomIDStr := c.Query("classroom_id")
	exportType := c.Query("type", "group") // "group" or "student"

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
	if err := config.DB.First(&semester, semesterID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Semester not found"})
	}

	// 1. Fetch workloads for semester
	var workloads []models.Workload
	config.DB.Where("semester_id = ?", semesterID).Order("deadline asc, id asc").Find(&workloads)

	// 2. Fetch final project criteria
	var criteria []models.FinalProjectCriteria
	config.DB.Where("semester_id = ?", semesterID).Find(&criteria)

	// 3. Fetch classrooms in this semester
	var classrooms []models.Classroom
	queryClassrooms := config.DB.Where("semester_id = ?", semesterID).Order("name asc")
	if classroomIDStr != "" && classroomIDStr != "all" {
		id, _ := strconv.Atoi(classroomIDStr)
		queryClassrooms = queryClassrooms.Where("id = ?", uint(id))
	}
	queryClassrooms.Find(&classrooms)

	// 4. Fetch all groups matching semester and optional classroom
	queryGroups := config.DB.
		Preload("Classroom").
		Preload("LeaderStudent").
		Preload("Members").
		Preload("Submissions.Grade").
		Where("semester_id = ?", semesterID).
		Order("classroom_id asc, id asc")

	if classroomIDStr != "" && classroomIDStr != "all" {
		id, _ := strconv.Atoi(classroomIDStr)
		queryGroups = queryGroups.Where("classroom_id = ?", uint(id))
	}

	var groups []models.Group
	queryGroups.Find(&groups)

	// 5. Calculate scores for all groups
	groupScoreMap := make(map[uint]GroupScoreData)
	classroomGroupsMap := make(map[uint][]GroupScoreData)

	for _, g := range groups {
		wlScores := make([]float64, len(workloads))
		wlGraded := make([]bool, len(workloads))
		gradedCount := 0
		accumulated := 0.0

		for i, wl := range workloads {
			var score float64 = 0.0
			isGraded := false
			for _, sub := range g.Submissions {
				if sub.WorkloadID == wl.ID && sub.Grade != nil {
					score = sub.Grade.Score
					isGraded = true
					break
				}
			}
			wlScores[i] = score
			wlGraded[i] = isGraded
			if isGraded {
				gradedCount++
			}
			accumulated += score
		}

		// Final project weighted average score and criteria breakdown
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

		data := GroupScoreData{
			Group:                g,
			WorkloadScores:       wlScores,
			WorkloadGraded:       wlGraded,
			GradedCount:          gradedCount,
			TotalWorkloads:       len(workloads),
			AccumulatedScore:     accumulated,
			FinalCriteriaScores:  finalCriteriaScores,
			FinalUnweightedScore: finalUnweightedScore,
			FinalProjectScore:    finalScore,
			TotalScore:           accumulated + finalScore,
		}

		groupScoreMap[g.ID] = data
		classroomGroupsMap[g.ClassroomID] = append(classroomGroupsMap[g.ClassroomID], data)
	}

	// 6. Initialize Excelize file
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Println("Error closing excel file:", err)
		}
	}()

	existingSheetNames := make(map[string]bool)

	// Styles
	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 14, Color: "0F172A"},
		Alignment: &excelize.Alignment{
			Horizontal: "left",
			Vertical:   "center",
		},
	})

	subtitleStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Size: 10, Color: "475569"},
		Alignment: &excelize.Alignment{
			Horizontal: "left",
			Vertical:   "center",
		},
	})

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "FFFFFF", Size: 10},
		Fill: excelize.Fill{
			Type:    "pattern",
			Color:   []string{"1E293B"},
			Pattern: 1,
		},
		Alignment: &excelize.Alignment{
			Horizontal: "center",
			Vertical:   "center",
			WrapText:   true,
		},
		Border: []excelize.Border{
			{Type: "top", Color: "94A3B8", Style: 1},
			{Type: "bottom", Color: "94A3B8", Style: 1},
			{Type: "left", Color: "94A3B8", Style: 1},
			{Type: "right", Color: "94A3B8", Style: 1},
		},
	})

	headerPinkStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "FFFFFF", Size: 10},
		Fill: excelize.Fill{
			Type:    "pattern",
			Color:   []string{"990000"}, // TU Red / Crimson theme
			Pattern: 1,
		},
		Alignment: &excelize.Alignment{
			Horizontal: "center",
			Vertical:   "center",
			WrapText:   true,
		},
		Border: []excelize.Border{
			{Type: "top", Color: "94A3B8", Style: 1},
			{Type: "bottom", Color: "94A3B8", Style: 1},
			{Type: "left", Color: "94A3B8", Style: 1},
			{Type: "right", Color: "94A3B8", Style: 1},
		},
	})

	dataTextStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Size: 10, Color: "1E293B"},
		Alignment: &excelize.Alignment{
			Horizontal: "left",
			Vertical:   "center",
		},
		Border: []excelize.Border{
			{Type: "top", Color: "E2E8F0", Style: 1},
			{Type: "bottom", Color: "E2E8F0", Style: 1},
			{Type: "left", Color: "E2E8F0", Style: 1},
			{Type: "right", Color: "E2E8F0", Style: 1},
		},
	})

	dataCenterStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Size: 10, Color: "1E293B"},
		Alignment: &excelize.Alignment{
			Horizontal: "center",
			Vertical:   "center",
		},
		Border: []excelize.Border{
			{Type: "top", Color: "E2E8F0", Style: 1},
			{Type: "bottom", Color: "E2E8F0", Style: 1},
			{Type: "left", Color: "E2E8F0", Style: 1},
			{Type: "right", Color: "E2E8F0", Style: 1},
		},
	})

	dataNumberStyle, _ := f.NewStyle(&excelize.Style{
		Font:         &excelize.Font{Size: 10, Color: "1E293B"},
		CustomNumFmt: &[]string{"0.00"}[0],
		Alignment: &excelize.Alignment{
			Horizontal: "right",
			Vertical:   "center",
		},
		Border: []excelize.Border{
			{Type: "top", Color: "E2E8F0", Style: 1},
			{Type: "bottom", Color: "E2E8F0", Style: 1},
			{Type: "left", Color: "E2E8F0", Style: 1},
			{Type: "right", Color: "E2E8F0", Style: 1},
		},
	})

	dataTotalScoreStyle, _ := f.NewStyle(&excelize.Style{
		Font:         &excelize.Font{Bold: true, Size: 10, Color: "990000"},
		CustomNumFmt: &[]string{"0.00"}[0],
		Alignment: &excelize.Alignment{
			Horizontal: "right",
			Vertical:   "center",
		},
		Border: []excelize.Border{
			{Type: "top", Color: "E2E8F0", Style: 1},
			{Type: "bottom", Color: "E2E8F0", Style: 1},
			{Type: "left", Color: "E2E8F0", Style: 1},
			{Type: "right", Color: "E2E8F0", Style: 1},
		},
	})

	renderSheet := func(sheetName, classroomTitle string, dataList []GroupScoreData) {
		// Row 1: Title
		f.SetCellValue(sheetName, "A1", fmt.Sprintf("รายงานผลคะแนนและการประเมินโครงการ GPMS - %s", classroomTitle))
		f.SetCellStyle(sheetName, "A1", "A1", titleStyle)

		// Row 2: Subtitle
		timestampStr := time.Now().Format("02/01/2006 15:04")
		f.SetCellValue(sheetName, "A2", fmt.Sprintf("ภาคเรียนที่ %d/%d | รูปแบบ: %s | ข้อมูล ณ วันที่: %s",
			semester.Term, semester.Year,
			map[string]string{"group": "สรุปผลรายกลุ่ม", "student": "รายชื่อนักเรียนรายบุคคล"}[exportType],
			timestampStr,
		))
		f.SetCellStyle(sheetName, "A2", "A2", subtitleStyle)

		// Row 4: Table Headers
		headerRow := 4
		f.SetRowHeight(sheetName, headerRow, 28)

		var headers []string
		if exportType == "student" {
			headers = []string{
				"ลำดับ", "รหัสนักเรียน/Username", "ชื่อ-นามสกุล", "ห้องเรียน",
				"ชื่อกลุ่ม", "บทบาท", "หัวข้องาน",
			}
		} else {
			headers = []string{
				"ลำดับ", "ห้องเรียน", "ชื่อกลุ่ม", "หัวข้องาน",
				"หัวหน้ากลุ่ม", "สมาชิกในกลุ่ม",
			}
		}

		// Workload columns
		for _, wl := range workloads {
			headers = append(headers, fmt.Sprintf("%s\n(เต็ม %.2f)", wl.Title, wl.MaxScore))
		}
		headers = append(headers, "รวมคะแนนย่อย")

		// Final Project Criteria columns
		totalCriteriaMaxScore := 0.0
		for _, crit := range criteria {
			headers = append(headers, fmt.Sprintf("Final: %s\n(เต็ม %.2f / ถ่วง %v%%)", crit.Title, crit.MaxScore, crit.Weight))
			totalCriteriaMaxScore += crit.MaxScore
		}

		// Summary columns
		headers = append(headers,
			fmt.Sprintf("รวม Final Project\nแบบไม่ถ่วงน้ำหนัก\n(เต็ม %.2f)", totalCriteriaMaxScore),
			"รวม Final Project\n(ถ่วงน้ำหนัก)",
			"คะแนนรวมสุทธิ",
			"สถานะการตรวจ",
		)

		for cIdx, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(cIdx+1, headerRow)
			f.SetCellValue(sheetName, cell, h)
			if h == "รวมคะแนนย่อย" || strings.HasPrefix(h, "รวม Final Project") || h == "คะแนนรวมสุทธิ" {
				f.SetCellStyle(sheetName, cell, cell, headerPinkStyle)
			} else {
				f.SetCellStyle(sheetName, cell, cell, headerStyle)
			}
		}

		// Rows data
		currentRow := 5
		rowCounter := 1

		if exportType == "student" {
			for _, item := range dataList {
				g := item.Group
				members := g.Members
				if len(members) == 0 && g.LeaderStudent.ID != 0 {
					members = []models.User{g.LeaderStudent}
				}

				for _, m := range members {
					f.SetRowHeight(sheetName, currentRow, 22)

					roleName := "สมาชิก"
					if m.ID == g.LeaderStudentID {
						roleName = "หัวหน้ากลุ่ม"
					}

					baseCols := []interface{}{
						rowCounter,
						m.Username,
						m.FullName,
						g.Classroom.Name,
						g.Name,
						roleName,
						g.ProjectTopic,
					}

					for cIdx, val := range baseCols {
						cell, _ := excelize.CoordinatesToCellName(cIdx+1, currentRow)
						f.SetCellValue(sheetName, cell, val)
						if cIdx == 0 || cIdx == 5 {
							f.SetCellStyle(sheetName, cell, cell, dataCenterStyle)
						} else {
							f.SetCellStyle(sheetName, cell, cell, dataTextStyle)
						}
					}

					colOffset := len(baseCols)
					// Workload scores
					for wIdx, score := range item.WorkloadScores {
						cell, _ := excelize.CoordinatesToCellName(colOffset+wIdx+1, currentRow)
						f.SetCellValue(sheetName, cell, score)
						f.SetCellStyle(sheetName, cell, cell, dataNumberStyle)
					}
					colOffset += len(workloads)

					// Accumulated workload score
					accCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
					f.SetCellValue(sheetName, accCell, item.AccumulatedScore)
					f.SetCellStyle(sheetName, accCell, accCell, dataNumberStyle)
					colOffset += 1

					// Final Project Criteria scores
					for cIdx, score := range item.FinalCriteriaScores {
						cell, _ := excelize.CoordinatesToCellName(colOffset+cIdx+1, currentRow)
						f.SetCellValue(sheetName, cell, score)
						f.SetCellStyle(sheetName, cell, cell, dataNumberStyle)
					}
					colOffset += len(criteria)

					// รวม Final Project แบบไม่ถ่วงน้ำหนัก
					rawFinCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
					f.SetCellValue(sheetName, rawFinCell, item.FinalUnweightedScore)
					f.SetCellStyle(sheetName, rawFinCell, rawFinCell, dataNumberStyle)
					colOffset += 1

					// รวม Final Project (ถ่วงน้ำหนัก)
					finCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
					f.SetCellValue(sheetName, finCell, item.FinalProjectScore)
					f.SetCellStyle(sheetName, finCell, finCell, dataNumberStyle)
					colOffset += 1

					// คะแนนรวมสุทธิ
					totCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
					f.SetCellValue(sheetName, totCell, item.TotalScore)
					f.SetCellStyle(sheetName, totCell, totCell, dataTotalScoreStyle)
					colOffset += 1

					// Status
					statusText := fmt.Sprintf("ตรวจแล้ว (%d/%d)", item.GradedCount, item.TotalWorkloads)
					if item.TotalWorkloads > 0 && item.GradedCount == item.TotalWorkloads {
						statusText = "ตรวจครบแล้ว"
					}
					statCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
					f.SetCellValue(sheetName, statCell, statusText)
					f.SetCellStyle(sheetName, statCell, statCell, dataCenterStyle)

					currentRow++
					rowCounter++
				}
			}
		} else {
			// Group level export
			for _, item := range dataList {
				g := item.Group
				f.SetRowHeight(sheetName, currentRow, 22)

				memberNames := make([]string, 0)
				for _, m := range g.Members {
					memberNames = append(memberNames, m.FullName)
				}

				baseCols := []interface{}{
					rowCounter,
					g.Classroom.Name,
					g.Name,
					g.ProjectTopic,
					g.LeaderStudent.FullName,
					strings.Join(memberNames, ", "),
				}

				for cIdx, val := range baseCols {
					cell, _ := excelize.CoordinatesToCellName(cIdx+1, currentRow)
					f.SetCellValue(sheetName, cell, val)
					if cIdx == 0 {
						f.SetCellStyle(sheetName, cell, cell, dataCenterStyle)
					} else {
						f.SetCellStyle(sheetName, cell, cell, dataTextStyle)
					}
				}

				colOffset := len(baseCols)
				// Workload scores
				for wIdx, score := range item.WorkloadScores {
					cell, _ := excelize.CoordinatesToCellName(colOffset+wIdx+1, currentRow)
					f.SetCellValue(sheetName, cell, score)
					f.SetCellStyle(sheetName, cell, cell, dataNumberStyle)
				}
				colOffset += len(workloads)

				// Accumulated workload score
				accCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
				f.SetCellValue(sheetName, accCell, item.AccumulatedScore)
				f.SetCellStyle(sheetName, accCell, accCell, dataNumberStyle)
				colOffset += 1

				// Final Project Criteria scores
				for cIdx, score := range item.FinalCriteriaScores {
					cell, _ := excelize.CoordinatesToCellName(colOffset+cIdx+1, currentRow)
					f.SetCellValue(sheetName, cell, score)
					f.SetCellStyle(sheetName, cell, cell, dataNumberStyle)
				}
				colOffset += len(criteria)

				// รวม Final Project แบบไม่ถ่วงน้ำหนัก
				rawFinCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
				f.SetCellValue(sheetName, rawFinCell, item.FinalUnweightedScore)
				f.SetCellStyle(sheetName, rawFinCell, rawFinCell, dataNumberStyle)
				colOffset += 1

				// รวม Final Project (ถ่วงน้ำหนัก)
				finCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
				f.SetCellValue(sheetName, finCell, item.FinalProjectScore)
				f.SetCellStyle(sheetName, finCell, finCell, dataNumberStyle)
				colOffset += 1

				// คะแนนรวมสุทธิ
				totCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
				f.SetCellValue(sheetName, totCell, item.TotalScore)
				f.SetCellStyle(sheetName, totCell, totCell, dataTotalScoreStyle)
				colOffset += 1

				// Status
				statusText := fmt.Sprintf("ตรวจแล้ว (%d/%d)", item.GradedCount, item.TotalWorkloads)
				if item.TotalWorkloads > 0 && item.GradedCount == item.TotalWorkloads {
					statusText = "ตรวจครบแล้ว"
				}
				statCell, _ := excelize.CoordinatesToCellName(colOffset+1, currentRow)
				f.SetCellValue(sheetName, statCell, statusText)
				f.SetCellStyle(sheetName, statCell, statCell, dataCenterStyle)

				currentRow++
				rowCounter++
			}
		}

		// Auto fit column width
		cols, err := f.GetCols(sheetName)
		if err == nil {
			for i, col := range cols {
				maxLen := 0
				for rIdx, val := range col {
					// Ignore long titles in rows 1 and 2
					if rIdx < 2 {
						continue
					}
					lines := strings.Split(val, "\n")
					for _, line := range lines {
						rLen := len([]rune(line))
						if rLen > maxLen {
							maxLen = rLen
						}
					}
				}
				colName, err := excelize.ColumnNumberToName(i + 1)
				if err == nil {
					width := float64(maxLen)*1.3 + 3
					if width < 12 {
						width = 12
					}
					if width > 42 {
						width = 42
					}
					f.SetColWidth(sheetName, colName, colName, width)
				}
			}
		}
	}

	// 7. Generate Sheets
	isAllClassrooms := classroomIDStr == "" || classroomIDStr == "all"

	if isAllClassrooms {
		// Sheet 1: Overview
		overviewSheet := "ภาพรวมทุกห้อง"
		existingSheetNames[strings.ToLower(overviewSheet)] = true
		f.SetSheetName("Sheet1", overviewSheet)

		allScoreList := make([]GroupScoreData, 0)
		for _, g := range groups {
			if data, ok := groupScoreMap[g.ID]; ok {
				allScoreList = append(allScoreList, data)
			}
		}
		renderSheet(overviewSheet, "ภาพรวมทุกห้องเรียน", allScoreList)

		// Subsequent Sheets: One per Classroom
		for _, cls := range classrooms {
			clsGroups := classroomGroupsMap[cls.ID]
			sheetName := sanitizeSheetName("ห้อง "+cls.Name, existingSheetNames)
			f.NewSheet(sheetName)
			renderSheet(sheetName, fmt.Sprintf("ห้องเรียน %s", cls.Name), clsGroups)
		}

		f.SetActiveSheet(0)
	} else {
		// Specific Classroom
		clsName := "ห้องเรียน"
		if len(classrooms) > 0 {
			clsName = classrooms[0].Name
		}
		sheetName := sanitizeSheetName("ห้อง "+clsName, existingSheetNames)
		f.SetSheetName("Sheet1", sheetName)

		clsGroups := make([]GroupScoreData, 0)
		for _, g := range groups {
			if data, ok := groupScoreMap[g.ID]; ok {
				clsGroups = append(clsGroups, data)
			}
		}
		renderSheet(sheetName, fmt.Sprintf("ห้องเรียน %s", clsName), clsGroups)
	}

	// 8. Output to client
	filename := fmt.Sprintf("GPMS_Score_Report_Term%d_%d_%s_%s.xlsx",
		semester.Term,
		semester.Year,
		exportType,
		time.Now().Format("20060102_1504"),
	)

	c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	buffer, err := f.WriteToBuffer()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate Excel file: " + err.Error()})
	}

	return c.Send(buffer.Bytes())
}
