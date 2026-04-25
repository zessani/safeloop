// Computes a low/medium/high risk score by launching goroutines+channels to
// concurrently fetch weather, CDC, and pathogen data, then combining weighted scores.

package main
