package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type WeatherCache struct {
	mu   sync.Mutex
	data map[string]weatherCacheEntry
}

type weatherCacheEntry struct {
	info      WeatherInfo
	fetchedAt time.Time
}

func NewWeatherCache() *WeatherCache {
	return &WeatherCache{
		data: make(map[string]weatherCacheEntry),
	}
}

type owmResponse struct {
	Main struct {
		Temp      float64 `json:"temp"`
		Humidity  int     `json:"humidity"`
		FeelsLike float64 `json:"feels_like"`
	} `json:"main"`
	Weather []struct {
		Description string `json:"description"`
	} `json:"weather"`
}

func fetchWeather(zip string, wc *WeatherCache) (WeatherInfo, error) {
	wc.mu.Lock()
	if entry, ok := wc.data[zip]; ok {
		if time.Since(entry.fetchedAt) < 10*time.Minute {
			wc.mu.Unlock()
			return entry.info, nil
		}
	}
	wc.mu.Unlock()

	apiKey := os.Getenv("OPENWEATHER_API_KEY")
	if apiKey == "" {
		return mockWeather(), nil
	}

	url := fmt.Sprintf("https://api.openweathermap.org/data/2.5/weather?zip=%s,us&appid=%s&units=metric", zip, apiKey)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return mockWeather(), err
	}
	defer resp.Body.Close()

	var owm owmResponse
	if err := json.NewDecoder(resp.Body).Decode(&owm); err != nil {
		return mockWeather(), err
	}

	desc := "clear sky"
	if len(owm.Weather) > 0 {
		desc = owm.Weather[0].Description
	}

	info := WeatherInfo{
		Temp:        owm.Main.Temp,
		Humidity:    owm.Main.Humidity,
		Description: desc,
	}

	wc.mu.Lock()
	wc.data[zip] = weatherCacheEntry{info: info, fetchedAt: time.Now()}
	wc.mu.Unlock()

	return info, nil
}

func mockWeather() WeatherInfo {
	return WeatherInfo{
		Temp:        35.0,
		Humidity:    40,
		Description: "clear sky",
	}
}

func fetchCDCActivity(zip string) CDCActivity {
	levels := []string{"minimal", "low", "low", "moderate", "high"}
	diseases := []string{"influenza-a", "rsv", "covid19", "influenza-b", "norovirus"}

	zipInt, err := strconv.Atoi(zip)
	if err != nil {
		zipInt = 0
	}
	idx := zipInt % 5

	return CDCActivity{
		ZipCode:       zip,
		ActivityLevel: levels[idx],
		DiseaseTag:    diseases[idx],
		UpdatedAt:     time.Now(),
	}
}

func fetchEpiCoreAlerts() []EpiCoreAlert {
	now := time.Now()
	return []EpiCoreAlert{
		{
			AlertID: "EPI-001", Disease: "H5N1 avian influenza", Region: "Cambodia", Country: "Cambodia",
			TransmissionType: "animal_origin", Severity: "HIGH",
			Symptoms: []string{"fever", "cough", "difficulty_breathing", "fatigue"}, ReportedAt: now.AddDate(0, 0, -3),
		},
		{
			AlertID: "EPI-002", Disease: "H5N1 avian influenza", Region: "Vietnam", Country: "Vietnam",
			TransmissionType: "animal_origin", Severity: "HIGH",
			Symptoms: []string{"fever", "cough", "difficulty_breathing"}, ReportedAt: now.AddDate(0, 0, -5),
		},
		{
			AlertID: "EPI-003", Disease: "Dengue fever", Region: "Brazil", Country: "Brazil",
			TransmissionType: "vector_borne", Severity: "MEDIUM",
			Symptoms: []string{"fever", "headache", "fatigue", "nausea"}, ReportedAt: now.AddDate(0, 0, -7),
		},
		{
			AlertID: "EPI-004", Disease: "Dengue fever", Region: "Mexico", Country: "Mexico",
			TransmissionType: "vector_borne", Severity: "MEDIUM",
			Symptoms: []string{"fever", "headache", "nausea"}, ReportedAt: now.AddDate(0, 0, -10),
		},
		{
			AlertID: "EPI-005", Disease: "Cholera", Region: "East Africa", Country: "Kenya",
			TransmissionType: "environmental", Severity: "HIGH",
			Symptoms: []string{"nausea", "fatigue"}, ReportedAt: now.AddDate(0, 0, -4),
		},
		{
			AlertID: "EPI-006", Disease: "Measles", Region: "Europe", Country: "France",
			TransmissionType: "person_to_person", Severity: "MEDIUM",
			Symptoms: []string{"fever", "cough", "fatigue"}, ReportedAt: now.AddDate(0, 0, -12),
		},
		{
			AlertID: "EPI-007", Disease: "Mpox", Region: "Central Africa", Country: "DRC",
			TransmissionType: "animal_origin", Severity: "MEDIUM",
			Symptoms: []string{"fever", "fatigue", "headache"}, ReportedAt: now.AddDate(0, 0, -8),
		},
		{
			AlertID: "EPI-008", Disease: "Marburg virus", Region: "Rwanda", Country: "Rwanda",
			TransmissionType: "animal_origin", Severity: "HIGH",
			Symptoms: []string{"fever", "fatigue", "nausea", "difficulty_breathing"}, ReportedAt: now.AddDate(0, 0, -2),
		},
		{
			AlertID: "EPI-009", Disease: "West Nile virus", Region: "Maricopa County AZ", Country: "US",
			TransmissionType: "vector_borne", Severity: "MEDIUM",
			Symptoms: []string{"fever", "headache", "fatigue"}, ReportedAt: now.AddDate(0, 0, -6),
		},
		{
			AlertID: "EPI-010", Disease: "Avian flu in dairy cattle", Region: "Texas", Country: "US",
			TransmissionType: "animal_origin", Severity: "HIGH",
			Symptoms: []string{"fever", "cough", "fatigue"}, ReportedAt: now.AddDate(0, 0, -9),
		},
		{
			AlertID: "EPI-011", Disease: "Avian flu in dairy cattle", Region: "Colorado", Country: "US",
			TransmissionType: "animal_origin", Severity: "HIGH",
			Symptoms: []string{"fever", "cough"}, ReportedAt: now.AddDate(0, 0, -11),
		},
		{
			AlertID: "EPI-012", Disease: "Valley Fever", Region: "Pima County AZ", Country: "US",
			TransmissionType: "environmental", Severity: "MEDIUM",
			Symptoms: []string{"cough", "fatigue", "difficulty_breathing"}, ReportedAt: now.AddDate(0, 0, -15),
		},
	}
}

func fetchPathogenAlerts() []PathogenAlert {
	return []PathogenAlert{
		{
			AlertID:       "PA-001",
			Region:        "Southern Arizona",
			Pathogen:      "Valley Fever (Coccidioides)",
			SeverityScore: 0.3,
			IssuedAt:      time.Now(),
		},
	}
}

type geminiRequest struct {
	Contents []geminiContent `json:"contents"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func generateNarrative(profile RiskProfile, weather WeatherInfo, matched []EpiCoreAlert, zip, ageBracket, occupation string) string {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return narrativeFallback(profile, zip)
	}

	var factors []string
	factors = append(factors, profile.Human.Factors...)
	factors = append(factors, profile.Animal.Factors...)
	factors = append(factors, profile.Environment.Factors...)

	var alertDescs []string
	for _, a := range matched {
		alertDescs = append(alertDescs, fmt.Sprintf("%s in %s (%s severity)", a.Disease, a.Region, a.Severity))
	}

	prompt := fmt.Sprintf(
		"You are a public health assistant. Given this health risk assessment, write a 2-3 sentence plain-English explanation for the user. Be clear and actionable. Respond in plain prose only. Do not use markdown formatting, asterisks, bullet points, headers, or any special syntax.\n\n"+
			"ZIP: %s\nAge: %s\nOccupation: %s\n"+
			"Risk Level: %s (score: %.2f)\n"+
			"Human Signal: %d/100\nAnimal Signal: %d/100\nEnvironment Signal: %d/100\n"+
			"Factors: %s\n"+
			"Weather: %.1f°C, %d%% humidity, %s\n"+
			"Active Alerts: %s",
		zip, ageBracket, occupation,
		profile.RiskLevel, profile.TotalScore,
		profile.Human.Score, profile.Animal.Score, profile.Environment.Score,
		strings.Join(factors, "; "),
		weather.Temp, weather.Humidity, weather.Description,
		strings.Join(alertDescs, "; "),
	)

	reqBody := geminiRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return narrativeFallback(profile, zip)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s", apiKey)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return narrativeFallback(profile, zip)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return narrativeFallback(profile, zip)
	}
	defer resp.Body.Close()

	var gemResp geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&gemResp); err != nil {
		return narrativeFallback(profile, zip)
	}

	if len(gemResp.Candidates) > 0 && len(gemResp.Candidates[0].Content.Parts) > 0 {
		return gemResp.Candidates[0].Content.Parts[0].Text
	}

	return narrativeFallback(profile, zip)
}

func narrativeFallback(profile RiskProfile, zip string) string {
	primary := profile.Human
	if profile.Animal.Score > primary.Score {
		primary = profile.Animal
	}
	if profile.Environment.Score > primary.Score {
		primary = profile.Environment
	}
	return fmt.Sprintf(
		"Based on your reported symptoms in ZIP %s, your risk level is %s. %s Signal is the primary driver at %d/100. Monitor your symptoms and consult a healthcare provider if they worsen.",
		zip, profile.RiskLevel, primary.Name, primary.Score,
	)
}
