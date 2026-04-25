package main

type weatherResult struct {
	info WeatherInfo
	err  error
}

type cdcResult struct {
	data CDCActivity
}

type pathogenResult struct {
	alerts []PathogenAlert
}

type epiCoreResult struct {
	alerts []EpiCoreAlert
}

func ComputeRisk(symptoms []string, zip string, travel, animal bool, wc *WeatherCache, store *ReportStore) (RiskLevel, float64, WeatherInfo, []EpiCoreAlert) {
	wCh := make(chan weatherResult, 1)
	cCh := make(chan cdcResult, 1)
	pCh := make(chan pathogenResult, 1)
	eCh := make(chan epiCoreResult, 1)

	go func() {
		w, e := fetchWeather(zip, wc)
		wCh <- weatherResult{w, e}
	}()
	go func() {
		cCh <- cdcResult{fetchCDCActivity(zip)}
	}()
	go func() {
		pCh <- pathogenResult{fetchPathogenAlerts()}
	}()
	go func() {
		eCh <- epiCoreResult{fetchEpiCoreAlerts()}
	}()

	wRes := <-wCh
	cRes := <-cCh
	pRes := <-pCh
	eRes := <-eCh

	score := 0.0
	score += scoreSymptoms(symptoms)
	score += scoreWeather(wRes.info)
	score += scoreCDC(cRes.data)
	score += scorePathogens(pRes.alerts)

	if travel {
		score += 0.05
	}
	if animal {
		score += 0.05
	}

	clusterReports := store.GetReportsByZip(zip, 24*60*60*1e9)
	if len(clusterReports) >= 2 {
		score += 0.10
	}

	if score > 1.0 {
		score = 1.0
	}

	matched := matchEpiCoreAlerts(eRes.alerts, symptoms, travel)

	level := levelFromScore(score)

	for _, alert := range matched {
		if alert.Severity == "HIGH" {
			level = RiskHigh
			break
		}
	}

	return level, score, wRes.info, matched
}

func matchEpiCoreAlerts(alerts []EpiCoreAlert, symptoms []string, traveled bool) []EpiCoreAlert {
	var matched []EpiCoreAlert
	for _, alert := range alerts {
		if alert.Country != "US" && !traveled {
			continue
		}
		overlap := symptomOverlap(symptoms, alert.Symptoms)
		if overlap >= 2 {
			matched = append(matched, alert)
		}
	}
	return matched
}

func scoreSymptoms(symptoms []string) float64 {
	weights := map[string]float64{
		"fever":                0.30,
		"difficulty_breathing": 0.35,
		"cough":               0.15,
		"fatigue":             0.10,
		"headache":            0.05,
		"nausea":              0.05,
	}

	score := 0.0
	for _, s := range symptoms {
		if w, ok := weights[s]; ok {
			score += w
		}
	}
	if score > 1.0 {
		score = 1.0
	}
	return score
}

func scoreWeather(w WeatherInfo) float64 {
	score := 0.0
	if w.Temp > 38 {
		score += 0.10
	}
	if w.Humidity > 85 {
		score += 0.10
	}
	return score
}

func scoreCDC(cdc CDCActivity) float64 {
	levels := map[string]float64{
		"minimal":  0.0,
		"low":      0.05,
		"moderate": 0.10,
		"high":     0.15,
	}
	if s, ok := levels[cdc.ActivityLevel]; ok {
		return s
	}
	return 0.0
}

func scorePathogens(alerts []PathogenAlert) float64 {
	score := 0.0
	for _, a := range alerts {
		score += a.SeverityScore
	}
	if score > 0.15 {
		score = 0.15
	}
	return score
}

func levelFromScore(score float64) RiskLevel {
	if score < 0.35 {
		return RiskLow
	}
	if score <= 0.65 {
		return RiskMedium
	}
	return RiskHigh
}
