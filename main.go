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
	cs := NewClusterStore()

	fmt.Println("==========================================")
	fmt.Println("  HealthPulse Surveillance System")
	fmt.Println("  TCP server starting on :8080")
	fmt.Println("  HTTP server starting on :8081")
	fmt.Println("==========================================")

	go StartHTTPServer(":8081", store, wc, cs)
	StartTCPServer(":8080", store, wc)
}
