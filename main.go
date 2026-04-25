package main

import (
	"fmt"
	"os"
)

func main() {
	apiKey := os.Getenv("OPENWEATHER_API_KEY")
	if apiKey == "" {
		fmt.Println("[WARNING] OPENWEATHER_API_KEY not set — using mock weather data")
	}

	store := NewReportStore()
	wc := NewWeatherCache()

	fmt.Println("==========================================")
	fmt.Println("  HealthPulse Surveillance System")
	fmt.Println("  TCP server starting on :8080")
	fmt.Println("==========================================")

	StartTCPServer(":8080", store, wc)
}
