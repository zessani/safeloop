package main

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"time"
)

var ageBrackets = []string{"under_18", "18_39", "40_64", "65_plus"}
var ageBracketLabels = []string{"Under 18", "18-39", "40-64", "65+"}

var occupations = []string{"student", "healthcare", "agriculture", "veterinary", "office", "service", "retired", "other"}
var occupationLabels = []string{"Student", "Healthcare worker", "Agriculture/farming", "Veterinary", "Office/remote", "Service industry", "Retired", "Other"}

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

	for {
		symptoms, err := promptSymptoms(rw)
		if err != nil {
			return
		}

		ageBracket, err := promptAge(rw)
		if err != nil {
			return
		}

		occupation, err := promptOccupation(rw)
		if err != nil {
			return
		}

		zip, err := promptZip(rw)
		if err != nil {
			return
		}

		travel, err := promptYesNo(rw, "[5] Recent travel outside Arizona? (y/n): ")
		if err != nil {
			return
		}

		animal, err := promptYesNo(rw, "[6] Recent animal contact? (y/n): ")
		if err != nil {
			return
		}

		writeLine(rw, "")
		writeLine(rw, "Computing risk assessment...")
		writeLine(rw, "")

		profile, weather, matched := ComputeRisk(symptoms, zip, travel, animal, wc, store, ageBracket, occupation)

		id := generateID()
		report := Report{
			ID:            id,
			ZipCode:       zip,
			Symptoms:      symptoms,
			TravelHistory: travel,
			AnimalContact: animal,
			Timestamp:     time.Now(),
			RiskScore:     profile.TotalScore,
			RiskLevel:     profile.RiskLevel,
			WeatherData:   weather,
			MatchedAlerts: matched,
			AgeBracket:    ageBracket,
			Occupation:    occupation,
		}
		store.AddReport(report)

		writeLine(rw, "==================================")
		writeLine(rw, fmt.Sprintf("  RISK LEVEL:  %s (score: %.2f)", profile.RiskLevel, profile.TotalScore))
		writeLine(rw, fmt.Sprintf("  Report ID:   %s", id))
		writeLine(rw, fmt.Sprintf("  Weather:     %.1f°C, %d%% humidity, %s", weather.Temp, weather.Humidity, weather.Description))
		writeLine(rw, "")
		writeLine(rw, "  One Health Breakdown:")
		writeBucket(rw, profile.Human)
		writeBucket(rw, profile.Animal)
		writeBucket(rw, profile.Environment)
		if len(matched) > 0 {
			writeLine(rw, "")
			writeLine(rw, "  EpiCore Matches:")
			for _, a := range matched {
				writeLine(rw, fmt.Sprintf("    ! %s (%s) — %s severity", a.Disease, a.Region, a.Severity))
			}
		}
		writeLine(rw, "==================================")
		writeLine(rw, "Thank you. Your report has been recorded.")
		writeLine(rw, "")

		if alert, found := store.CheckCluster(zip); found {
			broadcastAlert(store, alert)
		}

		writeLine(rw, "Press Enter to submit another report, or type 'quit' to disconnect.")
		write(rw, "> ")
		input, err := rw.ReadString('\n')
		if err != nil {
			return
		}
		if strings.TrimSpace(strings.ToLower(input)) == "quit" {
			writeLine(rw, "Goodbye!")
			return
		}
		writeLine(rw, "")
	}
}

func promptSymptoms(rw *bufio.ReadWriter) ([]string, error) {
	for {
		writeLine(rw, "[1] Select your symptoms (comma-separated numbers):")
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

		if len(selected) > 0 {
			return selected, nil
		}
		writeLine(rw, "Invalid input. Please enter at least one number (1-6).")
		writeLine(rw, "")
	}
}

func promptAge(rw *bufio.ReadWriter) (string, error) {
	for {
		writeLine(rw, "")
		writeLine(rw, "[2] Select your age bracket:")
		for i, label := range ageBracketLabels {
			writeLine(rw, fmt.Sprintf("  %d. %s", i+1, label))
		}
		write(rw, "> ")

		input, err := rw.ReadString('\n')
		if err != nil {
			return "", err
		}

		idx := 0
		fmt.Sscanf(strings.TrimSpace(input), "%d", &idx)
		if idx >= 1 && idx <= len(ageBrackets) {
			return ageBrackets[idx-1], nil
		}
		writeLine(rw, "Invalid input. Please enter a number (1-4).")
	}
}

func promptOccupation(rw *bufio.ReadWriter) (string, error) {
	for {
		writeLine(rw, "")
		writeLine(rw, "[3] Select your occupation:")
		for i, label := range occupationLabels {
			writeLine(rw, fmt.Sprintf("  %d. %s", i+1, label))
		}
		write(rw, "> ")

		input, err := rw.ReadString('\n')
		if err != nil {
			return "", err
		}

		idx := 0
		fmt.Sscanf(strings.TrimSpace(input), "%d", &idx)
		if idx >= 1 && idx <= len(occupations) {
			return occupations[idx-1], nil
		}
		writeLine(rw, "Invalid input. Please enter a number (1-8).")
	}
}

func promptZip(rw *bufio.ReadWriter) (string, error) {
	for {
		writeLine(rw, "")
		writeLine(rw, "[4] Enter your 5-digit ZIP code (AZ only):")
		write(rw, "> ")

		input, err := rw.ReadString('\n')
		if err != nil {
			return "", err
		}

		zip := strings.TrimSpace(input)
		if len(zip) == 5 {
			allDigits := true
			for _, c := range zip {
				if c < '0' || c > '9' {
					allDigits = false
					break
				}
			}
			if allDigits {
				return zip, nil
			}
		}
		writeLine(rw, "Invalid ZIP code. Please enter a 5-digit number (e.g. 85719).")
	}
}

func promptYesNo(rw *bufio.ReadWriter, question string) (bool, error) {
	for {
		writeLine(rw, "")
		write(rw, question)

		input, err := rw.ReadString('\n')
		if err != nil {
			return false, err
		}

		answer := strings.ToLower(strings.TrimSpace(input))
		if answer == "y" || answer == "yes" {
			return true, nil
		}
		if answer == "n" || answer == "no" {
			return false, nil
		}
		writeLine(rw, "Invalid input. Please enter y or n.")
	}
}

func writeBucket(rw *bufio.ReadWriter, b SignalBucket) {
	factors := ""
	if len(b.Factors) > 0 {
		factors = "  [" + strings.Join(b.Factors, ", ") + "]"
	}
	writeLine(rw, fmt.Sprintf("    %-12s %3d/100%s", b.Name+":", b.Score, factors))
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
