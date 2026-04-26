package main

import (
	"fmt"
	"math"
	"sort"
	"time"
)

type trajectoryPoint struct {
	Timestamp   string  `json:"timestamp"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	ReportCount int     `json:"report_count"`
}

type adjacentZip struct {
	Zip                  string  `json:"zip"`
	MilesFromCentroid    float64 `json:"miles_from_centroid"`
	RecentOverlapReports int     `json:"recent_overlap_reports"`
	SpreadLikelihood     string  `json:"spread_likelihood"`
}

type trajectoryResponse struct {
	ClusterID          string            `json:"cluster_id"`
	Trajectory         []trajectoryPoint `json:"trajectory"`
	DriftDirection     *string           `json:"drift_direction"`
	DriftDistanceMiles float64           `json:"drift_distance_miles"`
	DriftPeriodHours   float64           `json:"drift_period_hours"`
	AdjacentAtRiskZips []adjacentZip     `json:"adjacent_at_risk_zips"`
}

var zipCoords = map[string][2]float64{
	"85701": {32.221, -110.926},
	"85702": {32.210, -110.960},
	"85704": {32.295, -110.980},
	"85705": {32.262, -110.978},
	"85706": {32.160, -110.940},
	"85708": {32.180, -110.860},
	"85710": {32.220, -110.830},
	"85711": {32.215, -110.880},
	"85712": {32.240, -110.880},
	"85713": {32.210, -110.990},
	"85714": {32.175, -110.935},
	"85715": {32.240, -110.830},
	"85716": {32.236, -110.917},
	"85717": {32.250, -110.930},
	"85718": {32.314, -110.928},
	"85719": {32.241, -110.948},
	"85721": {32.232, -110.951},
	"85730": {32.210, -110.800},
	"85735": {32.130, -111.170},
	"85737": {32.410, -110.920},
	"85739": {32.430, -110.830},
	"85741": {32.340, -111.040},
	"85742": {32.380, -111.060},
	"85743": {32.290, -111.120},
	"85745": {32.240, -111.020},
	"85746": {32.130, -111.030},
	"85747": {32.140, -110.830},
	"85748": {32.190, -110.790},
	"85749": {32.280, -110.790},
	"85750": {32.300, -110.840},
	"85755": {32.420, -110.960},
	"85756": {32.100, -110.870},
	"85004": {33.451, -112.073},
	"85008": {33.461, -112.013},
	"85032": {33.618, -112.028},
	"85044": {33.310, -111.982},
	"85281": {33.425, -111.939},
	"85201": {33.415, -111.831},
	"85210": {33.381, -111.841},
	"85224": {33.303, -111.841},
	"85248": {33.248, -111.855},
	"86001": {35.198, -111.651},
}

const earthRadiusMiles = 3959.0

func haversine(lat1, lng1, lat2, lng2 float64) float64 {
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	rLat1 := lat1 * math.Pi / 180
	rLat2 := lat2 * math.Pi / 180

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rLat1)*math.Cos(rLat2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusMiles * c
}

func compassDirection(fromLat, fromLng, toLat, toLng float64) string {
	dist := haversine(fromLat, fromLng, toLat, toLng)
	if dist < 0.1 {
		return ""
	}

	dLng := (toLng - fromLng) * math.Pi / 180
	rFrom := fromLat * math.Pi / 180
	rTo := toLat * math.Pi / 180

	x := math.Sin(dLng) * math.Cos(rTo)
	y := math.Cos(rFrom)*math.Sin(rTo) - math.Sin(rFrom)*math.Cos(rTo)*math.Cos(dLng)
	bearing := math.Atan2(x, y) * 180 / math.Pi
	if bearing < 0 {
		bearing += 360
	}

	directions := []string{"north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"}
	idx := int(math.Round(bearing/45)) % 8
	return directions[idx]
}

func getReportsBefore(store *ReportStore, zip string, cutoff time.Time) []Report {
	store.mu.Lock()
	defer store.mu.Unlock()
	var results []Report
	for _, r := range store.reports {
		if r.ZipCode == zip && !r.Timestamp.After(cutoff) {
			results = append(results, r)
		}
	}
	return results
}

func computeTrajectory(clusterID string, store *ReportStore, cs *ClusterStore) (trajectoryResponse, error) {
	cluster, ok := cs.Get(clusterID)
	if !ok {
		return trajectoryResponse{}, fmt.Errorf("cluster not found")
	}

	coords, hasCoords := zipCoords[cluster.ZipCode]
	if !hasCoords {
		return trajectoryResponse{}, fmt.Errorf("no coordinates for zip %s", cluster.ZipCode)
	}

	now := time.Now()
	slices := []time.Time{
		now.Add(-72 * time.Hour),
		now.Add(-48 * time.Hour),
		now.Add(-24 * time.Hour),
		now,
	}

	var trajectory []trajectoryPoint
	for _, cutoff := range slices {
		reports := getReportsBefore(store, cluster.ZipCode, cutoff)
		if len(reports) > 0 {
			trajectory = append(trajectory, trajectoryPoint{
				Timestamp:   cutoff.Format(time.RFC3339),
				Lat:         coords[0],
				Lng:         coords[1],
				ReportCount: len(reports),
			})
		}
	}

	resp := trajectoryResponse{
		ClusterID:  clusterID,
		Trajectory: trajectory,
	}

	if len(trajectory) >= 2 {
		first := trajectory[0]
		last := trajectory[len(trajectory)-1]
		dist := haversine(first.Lat, first.Lng, last.Lat, last.Lng)
		resp.DriftDistanceMiles = math.Round(dist*10) / 10
		resp.DriftPeriodHours = 72
		dir := compassDirection(first.Lat, first.Lng, last.Lat, last.Lng)
		if dir != "" {
			resp.DriftDirection = &dir
		}
	}

	adjacent := findAdjacentRiskZips(coords[0], coords[1], cluster.ZipCode, cluster.DominantSymptoms, store)
	resp.AdjacentAtRiskZips = adjacent

	return resp, nil
}

func findAdjacentRiskZips(centroidLat, centroidLng float64, clusterZip string, dominantSymptoms []string, store *ReportStore) []adjacentZip {
	store.mu.Lock()
	allReports := make([]Report, len(store.reports))
	copy(allReports, store.reports)
	store.mu.Unlock()

	cutoff := time.Now().Add(-24 * time.Hour)

	var results []adjacentZip
	for zip, coords := range zipCoords {
		if zip == clusterZip {
			continue
		}
		dist := haversine(centroidLat, centroidLng, coords[0], coords[1])
		if dist > 10 {
			continue
		}

		overlapCount := 0
		for _, r := range allReports {
			if r.ZipCode == zip && r.Timestamp.After(cutoff) {
				if symptomOverlap(r.Symptoms, dominantSymptoms) > 0 {
					overlapCount++
				}
			}
		}

		likelihood := "LOW"
		if dist <= 5 && overlapCount >= 2 {
			likelihood = "HIGH"
		} else if dist <= 10 && overlapCount >= 1 {
			likelihood = "MEDIUM"
		}

		results = append(results, adjacentZip{
			Zip:                  zip,
			MilesFromCentroid:    math.Round(dist*10) / 10,
			RecentOverlapReports: overlapCount,
			SpreadLikelihood:     likelihood,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].MilesFromCentroid < results[j].MilesFromCentroid
	})

	if len(results) > 5 {
		results = results[:5]
	}

	return results
}
