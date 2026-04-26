package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func LoadReports(path string) ([]Report, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Report{}, nil
		}
		return nil, err
	}
	var reports []Report
	if err := json.Unmarshal(data, &reports); err != nil {
		return nil, err
	}
	return reports, nil
}

func SaveReports(path string, store *ReportStore) {
	store.mu.Lock()
	data, err := json.MarshalIndent(store.reports, "", "  ")
	store.mu.Unlock()
	if err != nil {
		fmt.Printf("Failed to marshal reports: %v\n", err)
		return
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		fmt.Printf("Failed to save reports: %v\n", err)
	}
}

func LoadClusters(path string) (map[string]*ClusterAlert, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return make(map[string]*ClusterAlert), nil
		}
		return nil, err
	}
	var list []*ClusterAlert
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	m := make(map[string]*ClusterAlert)
	for _, c := range list {
		m[c.ClusterID] = c
	}
	return m, nil
}

func SaveClusters(path string, cs *ClusterStore) {
	clusters := cs.GetAll()
	data, err := json.MarshalIndent(clusters, "", "  ")
	if err != nil {
		fmt.Printf("Failed to marshal clusters: %v\n", err)
		return
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		fmt.Printf("Failed to save clusters: %v\n", err)
	}
}
