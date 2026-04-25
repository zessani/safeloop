package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
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
