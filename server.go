// TCP listener on :8080 that spawns one goroutine per telnet client, runs the
// symptom interview, and broadcasts cluster alerts to all connected clients.

package main
