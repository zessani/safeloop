package main

import "fmt"

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

func ComputeRisk(symptoms []string, zip string, travel, animal bool, wc *WeatherCache, store *ReportStore, ageBracket, occupation string) (RiskProfile, WeatherInfo, []EpiCoreAlert) {
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

	matched := matchEpiCoreAlerts(eRes.alerts, symptoms, travel)

	clusterReports := store.GetReportsByZip(zip, 24*60*60*1e9)

	human := computeHumanSignal(symptoms, travel, ageBracket, occupation, animal, clusterReports, matched, wRes.info)
	animalBucket := computeAnimalSignal(animal, symptoms, matched)
	environment := computeEnvironmentSignal(wRes.info, cRes.data, pRes.alerts, matched)

	maxScore := human.Score
	if animalBucket.Score > maxScore {
		maxScore = animalBucket.Score
	}
	if environment.Score > maxScore {
		maxScore = environment.Score
	}

	if maxScore > 100 {
		maxScore = 100
	}

	totalScore := float64(maxScore) / 100.0
	level := levelFromScore(totalScore)

	for _, alert := range matched {
		if alert.Severity == "HIGH" {
			level = RiskHigh
			break
		}
	}

	profile := RiskProfile{
		Human:       human,
		Animal:      animalBucket,
		Environment: environment,
		TotalScore:  totalScore,
		RiskLevel:   level,
	}

	return profile, wRes.info, matched
}

func computeHumanSignal(symptoms []string, travel bool, ageBracket, occupation string, animal bool, clusterReports []Report, matched []EpiCoreAlert, weather WeatherInfo) SignalBucket {
	bucket := SignalBucket{Name: "Human", Score: 0}

	weights := map[string]int{
		"fever":                30,
		"difficulty_breathing": 35,
		"cough":               15,
		"fatigue":             10,
		"headache":            5,
		"nausea":              5,
	}

	symSet := make(map[string]bool)
	for _, s := range symptoms {
		symSet[s] = true
		if w, ok := weights[s]; ok {
			bucket.Score += w
			bucket.Factors = append(bucket.Factors, fmt.Sprintf("%s (+%d)", formatSymptom(s), w))
		}
	}

	if travel {
		bucket.Score += 10
		bucket.Factors = append(bucket.Factors, "travel (+10)")
	}

	if len(clusterReports) >= 2 {
		bucket.Score += 15
		bucket.Factors = append(bucket.Factors, fmt.Sprintf("cluster: %d recent reports (+15)", len(clusterReports)))
	}

	hasRespiratory := symSet["cough"] || symSet["difficulty_breathing"]

	if ageBracket == "65_plus" && hasRespiratory {
		bucket.Score += 15
		bucket.Factors = append(bucket.Factors, "65+ with respiratory symptoms (+15)")
	}

	if ageBracket == "under_18" && symSet["fever"] {
		bucket.Score += 5
		bucket.Factors = append(bucket.Factors, "under 18 with fever (+5)")
	}

	if (occupation == "healthcare" || occupation == "veterinary") && animal && symSet["fever"] {
		bucket.Score += 15
		bucket.Factors = append(bucket.Factors, fmt.Sprintf("%s + animal contact + fever (+15)", occupation))
	}

	isDusty := weather.Humidity < 30 || weather.Temp > 38
	if occupation == "agriculture" && hasRespiratory && isDusty {
		bucket.Score += 15
		bucket.Factors = append(bucket.Factors, "agriculture + respiratory + dust weather (+15)")
	}

	for _, alert := range matched {
		if alert.TransmissionType == "person_to_person" {
			pts := epiCorePoints(alert.Severity)
			bucket.Score += pts
			bucket.Factors = append(bucket.Factors, fmt.Sprintf("EpiCore: %s in %s (+%d)", alert.Disease, alert.Region, pts))
		}
	}

	if bucket.Score > 100 {
		bucket.Score = 100
	}

	return bucket
}

func computeAnimalSignal(animal bool, symptoms []string, matched []EpiCoreAlert) SignalBucket {
	bucket := SignalBucket{Name: "Animal", Score: 0}

	symSet := make(map[string]bool)
	for _, s := range symptoms {
		symSet[s] = true
	}

	if animal {
		bucket.Score += 40
		bucket.Factors = append(bucket.Factors, "animal contact (+40)")

		if symSet["fever"] {
			bucket.Score += 20
			bucket.Factors = append(bucket.Factors, "fever + animal contact (+20)")
		}
		if symSet["difficulty_breathing"] {
			bucket.Score += 15
			bucket.Factors = append(bucket.Factors, "difficulty breathing + animal contact (+15)")
		}
	}

	for _, alert := range matched {
		if alert.TransmissionType == "animal_origin" {
			pts := epiCorePoints(alert.Severity)
			bucket.Score += pts
			bucket.Factors = append(bucket.Factors, fmt.Sprintf("EpiCore: %s in %s (+%d)", alert.Disease, alert.Region, pts))
		}
	}

	if bucket.Score > 100 {
		bucket.Score = 100
	}

	return bucket
}

func computeEnvironmentSignal(weather WeatherInfo, cdc CDCActivity, pathogens []PathogenAlert, matched []EpiCoreAlert) SignalBucket {
	bucket := SignalBucket{Name: "Environment", Score: 0}

	if weather.Temp > 38 {
		bucket.Score += 15
		bucket.Factors = append(bucket.Factors, fmt.Sprintf("high temp %.1f°C (+15)", weather.Temp))
	}
	if weather.Humidity > 85 {
		bucket.Score += 15
		bucket.Factors = append(bucket.Factors, fmt.Sprintf("high humidity %d%% (+15)", weather.Humidity))
	}
	if weather.Humidity < 20 && weather.Temp > 35 {
		bucket.Score += 10
		bucket.Factors = append(bucket.Factors, "dust/heat advisory conditions (+10)")
	}

	cdcScores := map[string]int{
		"minimal":  0,
		"low":      10,
		"moderate": 25,
		"high":     40,
	}
	if pts, ok := cdcScores[cdc.ActivityLevel]; ok && pts > 0 {
		bucket.Score += pts
		bucket.Factors = append(bucket.Factors, fmt.Sprintf("CDC %s: %s (+%d)", cdc.ActivityLevel, cdc.DiseaseTag, pts))
	}

	for _, p := range pathogens {
		pts := int(p.SeverityScore * 100)
		if pts > 30 {
			pts = 30
		}
		if pts > 0 {
			bucket.Score += pts
			bucket.Factors = append(bucket.Factors, fmt.Sprintf("%s (+%d)", p.Pathogen, pts))
		}
	}

	for _, alert := range matched {
		if alert.TransmissionType == "vector_borne" || alert.TransmissionType == "environmental" {
			pts := epiCorePoints(alert.Severity)
			bucket.Score += pts
			bucket.Factors = append(bucket.Factors, fmt.Sprintf("EpiCore: %s in %s (+%d)", alert.Disease, alert.Region, pts))
		}
	}

	if bucket.Score > 100 {
		bucket.Score = 100
	}

	return bucket
}

func epiCorePoints(severity string) int {
	switch severity {
	case "HIGH":
		return 25
	case "MEDIUM":
		return 15
	case "LOW":
		return 5
	}
	return 0
}

func matchEpiCoreAlerts(alerts []EpiCoreAlert, symptoms []string, traveled bool) []EpiCoreAlert {
	var matched []EpiCoreAlert
	for _, alert := range alerts {
		if alert.Country != "US" && !traveled {
			continue
		}
		overlap := symptomOverlap(symptoms, alert.Symptoms)
		threshold := 2
		if alert.Severity == "HIGH" {
			threshold = 1
		}
		if overlap >= threshold {
			matched = append(matched, alert)
		}
	}
	return matched
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
