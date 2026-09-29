package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"gpms-backend/config"
	"gpms-backend/models"
)

type telegramPayload struct {
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode"`
}

func sendTelegramMessage(token, chatID, message string) {
	if token == "" || chatID == "" {
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := telegramPayload{
		ChatID:    chatID,
		Text:      message,
		ParseMode: "HTML",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal telegram payload: %v", err)
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("Failed to send telegram message: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Telegram API returned non-OK status: %s", resp.Status)
	}
}

func NotifyAdmin(message string) {
	var tokenSetting models.SystemSetting
	var groupSetting models.SystemSetting
	var activeSetting models.SystemSetting

	config.DB.Where("setting_key = ?", "telegram_token").First(&tokenSetting)
	config.DB.Where("setting_key = ?", "telegram_admin_group").First(&groupSetting)
	config.DB.Where("setting_key = ?", "notify_admin").First(&activeSetting)

	if activeSetting.SettingValue == "true" && tokenSetting.SettingValue != "" && groupSetting.SettingValue != "" {
		go sendTelegramMessage(tokenSetting.SettingValue, groupSetting.SettingValue, message)
	}
}

func NotifyStudent(message string) {
	var tokenSetting models.SystemSetting
	var groupSetting models.SystemSetting
	var activeSetting models.SystemSetting

	config.DB.Where("setting_key = ?", "telegram_token").First(&tokenSetting)
	config.DB.Where("setting_key = ?", "telegram_student_group").First(&groupSetting)
	config.DB.Where("setting_key = ?", "notify_student").First(&activeSetting)

	if activeSetting.SettingValue == "true" && tokenSetting.SettingValue != "" && groupSetting.SettingValue != "" {
		go sendTelegramMessage(tokenSetting.SettingValue, groupSetting.SettingValue, message)
	}
}
