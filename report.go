package main

import (
	"crypto/rand"
	"fmt"
	"net"
	"sync"
	"time"
)

type RiskLevel string

const (
	RiskLow    RiskLevel = "LOW"
	RiskMedium RiskLevel = "MEDIUM"
	RiskHigh   RiskLevel = "HIGH"
)

type WeatherInfo struct {
	Temp        float64
	Humidity    int
	Description string
}

type CDCActivity struct {
	ZipCode       string
	ActivityLevel string
	DiseaseTag    string
	UpdatedAt     time.Time
}

type PathogenAlert struct {
	AlertID       string
	Region        string
	Pathogen      string
	SeverityScore float64
	IssuedAt      time.Time
}

type Report struct {
	ID            string
	ZipCode       string
	Symptoms      []string
	TravelHistory bool
	AnimalContact bool
	Timestamp     time.Time
	RiskScore     float64
	RiskLevel     RiskLevel
	WeatherData   WeatherInfo
}

type ClusterAlert struct {
	ZipCode    string
	Count      int
	Symptoms   []string
	RiskLevel  RiskLevel
	DetectedAt time.Time
	Message    string
}

type ReportStore struct {
	mu      sync.Mutex
	reports []Report
	clients []net.Conn
}

func NewReportStore() *ReportStore {
	return &ReportStore{
		reports: make([]Report, 0),
		clients: make([]net.Conn, 0),
	}
}

func (s *ReportStore) AddReport(r Report) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reports = append(s.reports, r)
}

func (s *ReportStore) GetReportsByZip(zip string, window time.Duration) []Report {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-window)
	var results []Report
	for _, r := range s.reports {
		if r.ZipCode == zip && r.Timestamp.After(cutoff) {
			results = append(results, r)
		}
	}
	return results
}

func (s *ReportStore) CheckCluster(zip string) (ClusterAlert, bool) {
	recent := s.GetReportsByZip(zip, 24*time.Hour)

	if len(recent) < 3 {
		return ClusterAlert{}, false
	}

	symptomCount := make(map[string]int)
	for _, r := range recent {
		for _, sym := range r.Symptoms {
			symptomCount[sym]++
		}
	}

	var dominant []string
	for sym, count := range symptomCount {
		if count >= 2 {
			dominant = append(dominant, sym)
		}
	}

	if len(dominant) == 0 {
		return ClusterAlert{}, false
	}

	alert := ClusterAlert{
		ZipCode:    zip,
		Count:      len(recent),
		Symptoms:   dominant,
		RiskLevel:  RiskHigh,
		DetectedAt: time.Now(),
		Message:    fmt.Sprintf("CLUSTER ALERT: %d overlapping cases in ZIP %s (%s) — Risk: HIGH", len(recent), zip, joinSymptoms(dominant)),
	}
	return alert, true
}

func joinSymptoms(symptoms []string) string {
	result := ""
	for i, s := range symptoms {
		if i > 0 {
			result += ", "
		}
		result += s
	}
	return result
}

func symptomOverlap(a, b []string) int {
	set := make(map[string]bool)
	for _, s := range a {
		set[s] = true
	}
	count := 0
	for _, s := range b {
		if set[s] {
			count++
		}
	}
	return count
}

func addClient(s *ReportStore, conn net.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients = append(s.clients, conn)
}

func removeClient(s *ReportStore, conn net.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, c := range s.clients {
		if c == conn {
			s.clients = append(s.clients[:i], s.clients[i+1:]...)
			return
		}
	}
}

func generateID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}
