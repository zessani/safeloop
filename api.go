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
