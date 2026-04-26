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

	os.MkdirAll("./data", 0755)

	store := NewReportStore()
	wc := NewWeatherCache()
	cs := NewClusterStore()

	if reports, err := LoadReports("./data/reports.json"); err == nil && len(reports) > 0 {
		store.mu.Lock()
		store.reports = reports
		store.mu.Unlock()
		fmt.Printf("Loaded %d reports from disk\n", len(reports))
	}
	if clusters, err := LoadClusters("./data/clusters.json"); err == nil && len(clusters) > 0 {
		cs.mu.Lock()
		cs.clusters = clusters
		cs.mu.Unlock()
		fmt.Printf("Loaded %d clusters from disk\n", len(clusters))
	}

	fmt.Println("==========================================")
	fmt.Println("  SafeLoop Surveillance System")
	fmt.Println("  TCP server starting on :8080")
	fmt.Println("  HTTP server starting on :8081")
	fmt.Println("==========================================")

	go StartHTTPServer(":8081", store, wc, cs)
	StartTCPServer(":8080", store, wc)
}
