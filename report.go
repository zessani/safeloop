package main

import (
	"crypto/rand"
	"fmt"
	"net"
	"sort"
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
	Temp        float64 `json:"temp"`
	Humidity    int     `json:"humidity"`
	Description string  `json:"description"`
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
	MatchedAlerts []EpiCoreAlert
	AgeBracket    string
	Occupation    string
	Narrative     string
}

type EpiCoreAlert struct {
	AlertID          string    `json:"alert_id"`
	Disease          string    `json:"disease"`
	Region           string    `json:"region"`
	Country          string    `json:"country"`
	TransmissionType string    `json:"transmission_type"`
	Severity         string    `json:"severity"`
	Symptoms         []string  `json:"symptoms"`
	ReportedAt       time.Time `json:"reported_at"`
}

type SignalBucket struct {
	Name    string   `json:"name"`
	Score   int      `json:"score"`
	Factors []string `json:"factors"`
}

type RiskProfile struct {
	Human       SignalBucket `json:"human"`
	Animal      SignalBucket `json:"animal"`
	Environment SignalBucket `json:"environment"`
	TotalScore  float64      `json:"total_score"`
	RiskLevel   RiskLevel    `json:"risk_level"`
}

type ClusterAlert struct {
	ClusterID        string         `json:"cluster_id"`
	ZipCode          string         `json:"zip_code"`
	Count            int            `json:"count"`
	Symptoms         []string       `json:"symptoms"`
	DominantSymptoms []string       `json:"dominant_symptoms"`
	RiskLevel        RiskLevel      `json:"risk_level"`
	DetectedAt       time.Time      `json:"first_detected_at"`
	Message          string         `json:"message"`
	Status           string         `json:"status"`
	VerifiedAt       *time.Time     `json:"verified_at"`
	OfficerNotes     string         `json:"officer_notes"`
	MatchedAlerts    []EpiCoreAlert `json:"matched_alerts"`
}

type ReportStore struct {
	mu      sync.Mutex
	reports []Report
	clients []net.Conn
}

type ClusterStore struct {
	mu       sync.Mutex
	clusters map[string]*ClusterAlert
}

func NewClusterStore() *ClusterStore {
	return &ClusterStore{
		clusters: make(map[string]*ClusterAlert),
	}
}

func (cs *ClusterStore) Add(alert *ClusterAlert) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.clusters[alert.ClusterID] = alert
}

func (cs *ClusterStore) Get(id string) (*ClusterAlert, bool) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	c, ok := cs.clusters[id]
	return c, ok
}

func (cs *ClusterStore) GetAll() []*ClusterAlert {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	result := make([]*ClusterAlert, 0, len(cs.clusters))
	for _, c := range cs.clusters {
		result = append(result, c)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].DetectedAt.After(result[j].DetectedAt)
	})
	return result
}

func (cs *ClusterStore) Exists(zip string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	for _, c := range cs.clusters {
		if c.ZipCode == zip && (c.Status == "pending" || c.Status == "verified") {
			return true
		}
	}
	return false
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

	type symFreq struct {
		name  string
		count int
	}
	var freqs []symFreq
	for sym, count := range symptomCount {
		freqs = append(freqs, symFreq{sym, count})
	}
	sort.Slice(freqs, func(i, j int) bool { return freqs[i].count > freqs[j].count })
	var topSymptoms []string
	for i, f := range freqs {
		if i >= 3 {
			break
		}
		topSymptoms = append(topSymptoms, f.name)
	}

	seen := make(map[string]bool)
	var clusterAlerts []EpiCoreAlert
	for _, r := range recent {
		for _, a := range r.MatchedAlerts {
			if !seen[a.AlertID] {
				seen[a.AlertID] = true
				clusterAlerts = append(clusterAlerts, a)
			}
		}
	}

	alert := ClusterAlert{
		ClusterID:        generateID(),
		ZipCode:          zip,
		Count:            len(recent),
		Symptoms:         dominant,
		DominantSymptoms: topSymptoms,
		RiskLevel:        RiskHigh,
		DetectedAt:       time.Now(),
		Message:          fmt.Sprintf("CLUSTER ALERT: %d overlapping cases in ZIP %s (%s) — Risk: HIGH", len(recent), zip, joinSymptoms(dominant)),
		Status:           "pending",
		MatchedAlerts:    clusterAlerts,
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
