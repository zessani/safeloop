package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type wsHub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]bool
}

func newWSHub() *wsHub {
	return &wsHub{
		clients: make(map[*websocket.Conn]bool),
	}
}

func (h *wsHub) add(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = true
}

func (h *wsHub) remove(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
	conn.Close()
}

func (h *wsHub) broadcast(msg interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			delete(h.clients, conn)
			conn.Close()
		}
	}
}

type reportRequest struct {
	Symptoms      []string `json:"symptoms"`
	AgeBracket    string   `json:"age_bracket"`
	Occupation    string   `json:"occupation"`
	ZipCode       string   `json:"zip_code"`
	TravelHistory bool     `json:"travel_history"`
	AnimalContact bool     `json:"animal_contact"`
}

type reportResponse struct {
	ReportID        string       `json:"report_id"`
	RiskLevel       RiskLevel    `json:"risk_level"`
	TotalScore      float64      `json:"total_score"`
	Narrative       string       `json:"narrative"`
	Weather         WeatherInfo  `json:"weather"`
	OneHealth       oneHealthDTO `json:"one_health"`
	MatchedAlerts   []EpiCoreAlert `json:"matched_alerts"`
	ClusterDetected bool         `json:"cluster_detected"`
}

type oneHealthDTO struct {
	Human       SignalBucket `json:"human"`
	Animal      SignalBucket `json:"animal"`
	Environment SignalBucket `json:"environment"`
}

type aggregateResponse struct {
	Total  int            `json:"total"`
	ByZip  map[string]int `json:"by_zip"`
	ByRisk map[string]int `json:"by_risk"`
}

type wsMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func StartHTTPServer(port string, store *ReportStore, wc *WeatherCache, cs *ClusterStore) {
	hub := newWSHub()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/reports", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			handlePostReport(w, r, store, wc, hub, cs)
		case http.MethodGet:
			handleGetReports(w, r, store)
		case http.MethodOptions:
			w.WriteHeader(http.StatusOK)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/clusters", func(w http.ResponseWriter, r *http.Request) {
		handleGetClusters(w, r, store, cs)
	})
	mux.HandleFunc("POST /api/clusters/{id}/verify", func(w http.ResponseWriter, r *http.Request) {
		handleClusterAction(w, r, cs, hub, "verified")
	})
	mux.HandleFunc("POST /api/clusters/{id}/dismiss", func(w http.ResponseWriter, r *http.Request) {
		handleClusterAction(w, r, cs, hub, "dismissed")
	})
	mux.HandleFunc("GET /api/reports/list", func(w http.ResponseWriter, r *http.Request) {
		handleListReports(w, r, store)
	})
	mux.HandleFunc("GET /api/clusters/{id}/reports", func(w http.ResponseWriter, r *http.Request) {
		handleClusterReports(w, r, store, cs)
	})
	mux.HandleFunc("GET /api/clusters/{id}/trajectory", func(w http.ResponseWriter, r *http.Request) {
		handleClusterTrajectory(w, r, store, cs)
	})
	mux.HandleFunc("GET /api/officer/briefing", func(w http.ResponseWriter, r *http.Request) {
		handleBriefing(w, r, store, cs)
	})
	mux.HandleFunc("POST /api/admin/reset", func(w http.ResponseWriter, r *http.Request) {
		handleReset(w, r, store, cs)
	})
	mux.HandleFunc("/ws/alerts", func(w http.ResponseWriter, r *http.Request) {
		handleWSAlerts(w, r, hub)
	})

	handler := enableCORS(mux)

	fmt.Printf("HTTP server listening on %s\n", port)
	if err := http.ListenAndServe(port, handler); err != nil {
		fmt.Printf("HTTP server error: %v\n", err)
	}
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handlePostReport(w http.ResponseWriter, r *http.Request, store *ReportStore, wc *WeatherCache, hub *wsHub, cs *ClusterStore) {
	var req reportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Symptoms) == 0 || req.ZipCode == "" {
		http.Error(w, "symptoms and zip_code are required", http.StatusBadRequest)
		return
	}

	profile, weather, matched := ComputeRisk(
		req.Symptoms, req.ZipCode, req.TravelHistory, req.AnimalContact,
		wc, store, req.AgeBracket, req.Occupation,
	)

	narrative := generateNarrative(profile, weather, matched, req.ZipCode, req.AgeBracket, req.Occupation)

	id := generateID()
	report := Report{
		ID:            id,
		ZipCode:       req.ZipCode,
		Symptoms:      req.Symptoms,
		TravelHistory: req.TravelHistory,
		AnimalContact: req.AnimalContact,
		Timestamp:     time.Now(),
		RiskScore:     profile.TotalScore,
		RiskLevel:     profile.RiskLevel,
		WeatherData:   weather,
		MatchedAlerts: matched,
		AgeBracket:    req.AgeBracket,
		Occupation:    req.Occupation,
		Narrative:     narrative,
	}
	store.AddReport(report)

	clusterDetected := false
	if alert, found := store.CheckCluster(req.ZipCode); found {
		clusterDetected = true
		broadcastAlert(store, alert)
		if !cs.Exists(req.ZipCode) {
			cs.Add(&alert)
		} else {
			cs.Update(req.ZipCode, alert.Count, alert.Symptoms, alert.DominantSymptoms, alert.MatchedAlerts)
		}
		SaveClusters("./data/clusters.json", cs)
		hub.broadcast(wsMessage{
			Type: "cluster_alert",
			Payload: map[string]interface{}{
				"cluster_id": alert.ClusterID,
				"zip_code":   alert.ZipCode,
				"count":      alert.Count,
				"message":    alert.Message,
			},
		})
	}

	if profile.RiskLevel == RiskHigh {
		hub.broadcast(wsMessage{
			Type: "high_risk_report",
			Payload: map[string]interface{}{
				"zip_code":    req.ZipCode,
				"risk_level":  profile.RiskLevel,
				"total_score": profile.TotalScore,
			},
		})
	}

	resp := reportResponse{
		ReportID:   id,
		RiskLevel:  profile.RiskLevel,
		TotalScore: profile.TotalScore,
		Narrative:  narrative,
		Weather:    weather,
		OneHealth: oneHealthDTO{
			Human:       profile.Human,
			Animal:      profile.Animal,
			Environment: profile.Environment,
		},
		MatchedAlerts:   matched,
		ClusterDetected: clusterDetected,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleGetReports(w http.ResponseWriter, r *http.Request, store *ReportStore) {
	zipFilter := r.URL.Query().Get("zip")

	store.mu.Lock()
	reports := store.reports
	store.mu.Unlock()

	byZip := make(map[string]int)
	byRisk := make(map[string]int)
	total := 0

	for _, rep := range reports {
		if zipFilter != "" && rep.ZipCode != zipFilter {
			continue
		}
		total++
		byZip[rep.ZipCode]++
		byRisk[string(rep.RiskLevel)]++
	}

	resp := aggregateResponse{
		Total:  total,
		ByZip:  byZip,
		ByRisk: byRisk,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type mapReportEntry struct {
	ID        string   `json:"id"`
	ZipCode   string   `json:"zip_code"`
	Symptoms  []string `json:"symptoms"`
	RiskLevel string   `json:"risk_level"`
	Timestamp string   `json:"timestamp"`
}

func handleListReports(w http.ResponseWriter, r *http.Request, store *ReportStore) {
	rangeParam := r.URL.Query().Get("range")
	var window time.Duration
	switch rangeParam {
	case "24h":
		window = 24 * time.Hour
	case "30d":
		window = 30 * 24 * time.Hour
	default:
		window = 7 * 24 * time.Hour
	}

	cutoff := time.Now().Add(-window)

	store.mu.Lock()
	var entries []mapReportEntry
	for _, rep := range store.reports {
		if rep.Timestamp.After(cutoff) {
			entries = append(entries, mapReportEntry{
				ID:        rep.ID,
				ZipCode:   rep.ZipCode,
				Symptoms:  rep.Symptoms,
				RiskLevel: string(rep.RiskLevel),
				Timestamp: rep.Timestamp.Format(time.RFC3339),
			})
		}
	}
	store.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"reports": entries,
	})
}

func handleGetClusters(w http.ResponseWriter, r *http.Request, store *ReportStore, cs *ClusterStore) {
	clusters := cs.GetAll()
	for _, c := range clusters {
		reports := store.GetReportsByZip(c.ZipCode, 24*time.Hour)
		c.Count = len(reports)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"clusters": clusters,
	})
}

type clusterActionRequest struct {
	OfficerNotes string `json:"officer_notes"`
}

func handleClusterAction(w http.ResponseWriter, r *http.Request, cs *ClusterStore, hub *wsHub, action string) {
	id := r.PathValue("id")
	cluster, ok := cs.Get(id)
	if !ok {
		http.Error(w, "cluster not found", http.StatusNotFound)
		return
	}

	var req clusterActionRequest
	json.NewDecoder(r.Body).Decode(&req)

	cs.mu.Lock()
	now := time.Now()
	cluster.Status = action
	cluster.VerifiedAt = &now
	cluster.OfficerNotes = req.OfficerNotes
	cs.mu.Unlock()

	SaveClusters("./data/clusters.json", cs)

	msgType := "cluster_verified"
	if action == "dismissed" {
		msgType = "cluster_dismissed"
	}
	hub.broadcast(wsMessage{
		Type: msgType,
		Payload: map[string]interface{}{
			"cluster_id": cluster.ClusterID,
			"zip_code":   cluster.ZipCode,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cluster)
}

type briefingResponse struct {
	GeneratedAt      time.Time            `json:"generated_at"`
	Summary          string               `json:"summary"`
	Stats            briefingStats        `json:"stats"`
	ReportsPerDay    []dayCount           `json:"reports_per_day"`
	TopZips          []zipStat            `json:"top_zips"`
	SymptomFrequency []symptomCount       `json:"symptom_frequency"`
	RiskDistribution map[string]int       `json:"risk_distribution"`
	RecentAlerts     []briefingAlertEntry `json:"recent_global_alerts"`
}

type briefingStats struct {
	ReportsToday     int `json:"reports_today"`
	Reports7d        int `json:"reports_7d"`
	PendingClusters  int `json:"active_pending_clusters"`
	VerifiedClusters int `json:"active_verified_clusters"`
}

type dayCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type zipStat struct {
	Zip         string `json:"zip"`
	Count       int    `json:"count"`
	HighestRisk string `json:"highest_risk"`
}

type symptomCount struct {
	Symptom string `json:"symptom"`
	Count   int    `json:"count"`
}

type briefingAlertEntry struct {
	Disease          string `json:"disease"`
	Region           string `json:"region"`
	Severity         string `json:"severity"`
	TransmissionType string `json:"transmission_type"`
}

var riskRank = map[RiskLevel]int{RiskHigh: 3, RiskMedium: 2, RiskLow: 1}

var briefingCache struct {
	mu        sync.Mutex
	summary   string
	fetchedAt time.Time
}

func handleBriefing(w http.ResponseWriter, r *http.Request, store *ReportStore, cs *ClusterStore) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	sevenDaysAgo := now.Add(-168 * time.Hour)

	store.mu.Lock()
	allReports := make([]Report, len(store.reports))
	copy(allReports, store.reports)
	store.mu.Unlock()

	var reportsToday, reports7d int
	zipCounts := make(map[string]int)
	zipHighest := make(map[string]RiskLevel)
	dayCounts := make(map[string]int)
	symCounts := make(map[string]int)
	riskDist := map[string]int{"HIGH": 0, "MEDIUM": 0, "LOW": 0}

	for _, rep := range allReports {
		if rep.Timestamp.After(todayStart) {
			reportsToday++
		}
		if rep.Timestamp.After(sevenDaysAgo) {
			reports7d++
			day := rep.Timestamp.Format("2006-01-02")
			dayCounts[day]++
			zipCounts[rep.ZipCode]++
			if riskRank[rep.RiskLevel] > riskRank[zipHighest[rep.ZipCode]] {
				zipHighest[rep.ZipCode] = rep.RiskLevel
			}
			for _, sym := range rep.Symptoms {
				symCounts[sym]++
			}
			riskDist[string(rep.RiskLevel)]++
		}
	}

	var reportsPerDay []dayCount
	for i := 6; i >= 0; i-- {
		d := now.AddDate(0, 0, -i).Format("2006-01-02")
		reportsPerDay = append(reportsPerDay, dayCount{Date: d, Count: dayCounts[d]})
	}

	type zipEntry struct {
		zip   string
		count int
	}
	var zipList []zipEntry
	for z, c := range zipCounts {
		zipList = append(zipList, zipEntry{z, c})
	}
	sort.Slice(zipList, func(i, j int) bool {
		if zipList[i].count != zipList[j].count {
			return zipList[i].count > zipList[j].count
		}
		return zipList[i].zip < zipList[j].zip
	})
	var topZips []zipStat
	for i, z := range zipList {
		if i >= 5 {
			break
		}
		topZips = append(topZips, zipStat{Zip: z.zip, Count: z.count, HighestRisk: string(zipHighest[z.zip])})
	}

	allSymptoms := []string{"fever", "cough", "fatigue", "difficulty_breathing", "headache", "nausea"}
	var symFreq []symptomCount
	for _, s := range allSymptoms {
		symFreq = append(symFreq, symptomCount{Symptom: s, Count: symCounts[s]})
	}
	sort.Slice(symFreq, func(i, j int) bool { return symFreq[i].Count > symFreq[j].Count })

	clusters := cs.GetAll()
	var pendingClusters, verifiedClusters int
	for _, c := range clusters {
		if c.Status == "pending" {
			pendingClusters++
		}
		if c.Status == "verified" {
			verifiedClusters++
		}
	}

	epiAlerts := fetchEpiCoreAlerts()
	sevOrder := map[string]int{"HIGH": 0, "MEDIUM": 1, "LOW": 2}
	sort.Slice(epiAlerts, func(i, j int) bool {
		return sevOrder[epiAlerts[i].Severity] < sevOrder[epiAlerts[j].Severity]
	})
	var recentAlerts []briefingAlertEntry
	for i, a := range epiAlerts {
		if i >= 5 {
			break
		}
		recentAlerts = append(recentAlerts, briefingAlertEntry{
			Disease:          a.Disease,
			Region:           a.Region,
			Severity:         a.Severity,
			TransmissionType: a.TransmissionType,
		})
	}

	stats := briefingStats{
		ReportsToday:     reportsToday,
		Reports7d:        reports7d,
		PendingClusters:  pendingClusters,
		VerifiedClusters: verifiedClusters,
	}

	statsData := map[string]interface{}{
		"stats":              stats,
		"reports_per_day":    reportsPerDay,
		"top_zips":           topZips,
		"symptom_frequency":  symFreq,
		"risk_distribution":  riskDist,
		"recent_global_alerts": recentAlerts,
	}
	statsJSON, _ := json.Marshal(statsData)

	topZipName := "N/A"
	if len(topZips) > 0 {
		topZipName = topZips[0].Zip
	}
	fallback := fmt.Sprintf("Today: %d new reports across Arizona. %s shows highest activity. %d clusters require review. See dashboard below.",
		reportsToday, topZipName, pendingClusters)

	briefingCache.mu.Lock()
	var summary string
	if time.Since(briefingCache.fetchedAt) < 10*time.Minute && briefingCache.summary != "" {
		summary = briefingCache.summary
	} else {
		summary = generateBriefingSummary(string(statsJSON), fallback)
		summary = strings.ReplaceAll(summary, "**", "")
		summary = strings.ReplaceAll(summary, "*", "")
		briefingCache.summary = summary
		briefingCache.fetchedAt = time.Now()
	}
	briefingCache.mu.Unlock()

	resp := briefingResponse{
		GeneratedAt:      now,
		Summary:          summary,
		Stats:            stats,
		ReportsPerDay:    reportsPerDay,
		TopZips:          topZips,
		SymptomFrequency: symFreq,
		RiskDistribution: riskDist,
		RecentAlerts:     recentAlerts,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleReset(w http.ResponseWriter, r *http.Request, store *ReportStore, cs *ClusterStore) {
	store.Clear()
	cs.Clear()
	os.Remove("./data/reports.json")
	os.Remove("./data/clusters.json")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "reset"})
}

func handleWSAlerts(w http.ResponseWriter, r *http.Request, hub *wsHub) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	hub.add(conn)
	defer hub.remove(conn)

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

type clusterReportEntry struct {
	ReportID      string   `json:"report_id"`
	SubmittedAt   string   `json:"submitted_at"`
	AgeBracket    string   `json:"age_bracket"`
	Occupation    string   `json:"occupation"`
	Symptoms      []string `json:"symptoms"`
	TravelHistory bool     `json:"travel_history"`
	AnimalContact bool     `json:"animal_contact"`
	RiskLevel     string   `json:"risk_level"`
	TotalScore    float64  `json:"total_score"`
}

func handleClusterReports(w http.ResponseWriter, r *http.Request, store *ReportStore, cs *ClusterStore) {
	id := r.PathValue("id")
	cluster, ok := cs.Get(id)
	if !ok {
		http.Error(w, `{"error":"cluster not found"}`, http.StatusNotFound)
		return
	}

	reports := store.GetReportsForCluster(cluster.ZipCode, cluster.DetectedAt)

	if len(reports) < 3 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Cluster too small to display individual reports (k-anonymity threshold)",
		})
		return
	}

	entries := make([]clusterReportEntry, len(reports))
	for i, rpt := range reports {
		entries[i] = clusterReportEntry{
			ReportID:      rpt.ID,
			SubmittedAt:   rpt.Timestamp.Format(time.RFC3339),
			AgeBracket:    rpt.AgeBracket,
			Occupation:    rpt.Occupation,
			Symptoms:      rpt.Symptoms,
			TravelHistory: rpt.TravelHistory,
			AnimalContact: rpt.AnimalContact,
			RiskLevel:     string(rpt.RiskLevel),
			TotalScore:    rpt.RiskScore,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": id,
		"reports":    entries,
	})
}

func handleClusterTrajectory(w http.ResponseWriter, r *http.Request, store *ReportStore, cs *ClusterStore) {
	id := r.PathValue("id")
	resp, err := computeTrajectory(id, store, cs)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
