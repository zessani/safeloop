package main

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"time"
)

var symptomList = []string{
	"fever",
	"cough",
	"fatigue",
	"difficulty_breathing",
	"headache",
	"nausea",
}

func StartTCPServer(port string, store *ReportStore, wc *WeatherCache) {
	listener, err := net.Listen("tcp", port)
	if err != nil {
		fmt.Printf("Failed to start TCP server: %v\n", err)
		return
	}
	defer listener.Close()

	fmt.Printf("TCP server listening on %s\n", port)

	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Printf("Accept error: %v\n", err)
			continue
		}
		go handleClient(conn, store, wc)
	}
}

func handleClient(conn net.Conn, store *ReportStore, wc *WeatherCache) {
	defer conn.Close()
	addClient(store, conn)
	defer removeClient(store, conn)

	rw := bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))

	writeLine(rw, "")
	writeLine(rw, "Welcome to HealthPulse Surveillance System")
	writeLine(rw, "==========================================")
	writeLine(rw, "")

	symptoms, err := promptSymptoms(rw)
	if err != nil {
		return
	}

	zip, err := promptZip(rw)
	if err != nil {
		return
	}

	travel, err := promptYesNo(rw, "Recent travel outside Arizona? (y/n): ")
	if err != nil {
		return
	}

	animal, err := promptYesNo(rw, "Recent animal contact? (y/n): ")
	if err != nil {
		return
	}

	writeLine(rw, "")
	writeLine(rw, "Computing risk assessment...")
	writeLine(rw, "")

	level, score, weather := ComputeRisk(symptoms, zip, travel, animal, wc, store)

	id := generateID()
	report := Report{
		ID:            id,
		ZipCode:       zip,
		Symptoms:      symptoms,
		TravelHistory: travel,
		AnimalContact: animal,
		Timestamp:     time.Now(),
		RiskScore:     score,
		RiskLevel:     level,
		WeatherData:   weather,
	}
	store.AddReport(report)

	writeLine(rw, "==================================")
	writeLine(rw, fmt.Sprintf("  RISK LEVEL:  %s (score: %.2f)", level, score))
	writeLine(rw, fmt.Sprintf("  Report ID:   %s", id))
	writeLine(rw, fmt.Sprintf("  Weather:     %.1f°C, %d%% humidity, %s", weather.Temp, weather.Humidity, weather.Description))
	writeLine(rw, "==================================")
	writeLine(rw, "Thank you. Your report has been recorded.")
	writeLine(rw, "")

	if alert, found := store.CheckCluster(zip); found {
		broadcastAlert(store, alert)
	}
}

func promptSymptoms(rw *bufio.ReadWriter) ([]string, error) {
	writeLine(rw, "[1] Select symptoms (comma-separated numbers):")
	for i, s := range symptomList {
		writeLine(rw, fmt.Sprintf("  %d. %s", i+1, formatSymptom(s)))
	}
	write(rw, "> ")

	input, err := rw.ReadString('\n')
	if err != nil {
		return nil, err
	}

	input = strings.TrimSpace(input)
	parts := strings.Split(input, ",")

	var selected []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		idx := 0
		fmt.Sscanf(p, "%d", &idx)
		if idx >= 1 && idx <= len(symptomList) {
			selected = append(selected, symptomList[idx-1])
		}
	}

	if len(selected) == 0 {
		writeLine(rw, "No valid symptoms selected, defaulting to 'fatigue'")
		selected = []string{"fatigue"}
	}

	return selected, nil
}

func promptZip(rw *bufio.ReadWriter) (string, error) {
	writeLine(rw, "")
	writeLine(rw, "[2] Enter your 5-digit ZIP code (AZ only):")
	write(rw, "> ")

	input, err := rw.ReadString('\n')
	if err != nil {
		return "", err
	}

	zip := strings.TrimSpace(input)
	if len(zip) != 5 {
		writeLine(rw, "Invalid zip, defaulting to 85719")
		zip = "85719"
	}

	return zip, nil
}

func promptYesNo(rw *bufio.ReadWriter, question string) (bool, error) {
	writeLine(rw, "")
	write(rw, question)

	input, err := rw.ReadString('\n')
	if err != nil {
		return false, err
	}

	answer := strings.ToLower(strings.TrimSpace(input))
	return answer == "y" || answer == "yes", nil
}

func broadcastAlert(store *ReportStore, alert ClusterAlert) {
	store.mu.Lock()
	defer store.mu.Unlock()

	msg := fmt.Sprintf("\n*** %s ***\n", alert.Message)

	for _, conn := range store.clients {
		conn.Write([]byte(msg))
	}
}

func formatSymptom(s string) string {
	s = strings.ReplaceAll(s, "_", " ")
	return strings.ToUpper(s[:1]) + s[1:]
}

func writeLine(rw *bufio.ReadWriter, s string) {
	rw.WriteString(s + "\r\n")
	rw.Flush()
}

func write(rw *bufio.ReadWriter, s string) {
	rw.WriteString(s)
	rw.Flush()
}
