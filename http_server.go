package main

import (
	"encoding/json"
	"fmt"
	"net/http"
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
		handleGetClusters(w, r, cs)
	})
	mux.HandleFunc("POST /api/clusters/{id}/verify", func(w http.ResponseWriter, r *http.Request) {
		handleClusterAction(w, r, cs, hub, "verified")
	})
	mux.HandleFunc("POST /api/clusters/{id}/dismiss", func(w http.ResponseWriter, r *http.Request) {
		handleClusterAction(w, r, cs, hub, "dismissed")
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
		}
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

func handleGetClusters(w http.ResponseWriter, r *http.Request, cs *ClusterStore) {
	clusters := cs.GetAll()
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
