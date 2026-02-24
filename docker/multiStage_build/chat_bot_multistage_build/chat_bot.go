package main

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"
)

// ─────────────────────────────────────────────
//  Data Structures
// ─────────────────────────────────────────────

// Client represents a connected user.
type Client struct {
	conn     net.Conn
	username string
	room     string
	send     chan string
}

// Room holds all clients in a chat room.
type Room struct {
	name    string
	clients map[*Client]bool
	mu      sync.RWMutex
}

// Server is the central hub.
type Server struct {
	rooms    map[string]*Room
	mu       sync.RWMutex
	register chan *Client
	leave    chan *Client
}

// ─────────────────────────────────────────────
//  Server Logic
// ─────────────────────────────────────────────

func newServer() *Server {
	s := &Server{
		rooms:    make(map[string]*Room),
		register: make(chan *Client, 10),
		leave:    make(chan *Client, 10),
	}
	// Create a default lobby room
	s.rooms["lobby"] = &Room{name: "lobby", clients: make(map[*Client]bool)}
	return s
}

// getOrCreateRoom returns an existing room or creates a new one.
func (s *Server) getOrCreateRoom(name string) *Room {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.rooms[name]; ok {
		return r
	}
	r := &Room{name: name, clients: make(map[*Client]bool)}
	s.rooms[name] = r
	log.Printf("[SERVER] Room created: #%s", name)
	return r
}

// broadcastToRoom sends a message to all clients in a room except the sender.
func (s *Server) broadcastToRoom(room *Room, msg string, sender *Client) {
	room.mu.RLock()
	defer room.mu.RUnlock()
	for c := range room.clients {
		if c != sender {
			select {
			case c.send <- msg:
			default:
				// drop if channel is full
			}
		}
	}
}

// joinRoom moves a client into a room.
func (s *Server) joinRoom(c *Client, roomName string) {
	// Leave current room first
	if c.room != "" {
		s.leaveRoom(c)
	}

	room := s.getOrCreateRoom(roomName)

	room.mu.Lock()
	room.clients[c] = true
	room.mu.Unlock()

	c.room = roomName
	c.send <- fmt.Sprintf("✅  Joined #%s", roomName)
	s.broadcastToRoom(room, fmt.Sprintf("📢  %s joined #%s", c.username, roomName), c)
	log.Printf("[%s] joined #%s", c.username, roomName)
}

// leaveRoom removes a client from their current room.
func (s *Server) leaveRoom(c *Client) {
	s.mu.RLock()
	room, ok := s.rooms[c.room]
	s.mu.RUnlock()
	if !ok {
		return
	}

	room.mu.Lock()
	delete(room.clients, c)
	room.mu.Unlock()

	s.broadcastToRoom(room, fmt.Sprintf("🚪  %s left #%s", c.username, c.room), c)
	log.Printf("[%s] left #%s", c.username, c.room)
	c.room = ""
}

// listRooms returns a formatted list of active rooms.
func (s *Server) listRooms() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var sb strings.Builder
	sb.WriteString("📋  Active rooms:\n")
	for name, room := range s.rooms {
		room.mu.RLock()
		count := len(room.clients)
		room.mu.RUnlock()
		sb.WriteString(fmt.Sprintf("   #%-15s  (%d users)\n", name, count))
	}
	return sb.String()
}

// listUsers returns users in a given room.
func (s *Server) listUsers(roomName string) string {
	s.mu.RLock()
	room, ok := s.rooms[roomName]
	s.mu.RUnlock()
	if !ok {
		return "❌  Room not found."
	}
	room.mu.RLock()
	defer room.mu.RUnlock()
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("👥  Users in #%s:\n", roomName))
	for c := range room.clients {
		sb.WriteString(fmt.Sprintf("   • %s\n", c.username))
	}
	return sb.String()
}

// ─────────────────────────────────────────────
//  Client Handler
// ─────────────────────────────────────────────

func (s *Server) handleClient(conn net.Conn) {
	defer conn.Close()

	reader := bufio.NewReader(conn)

	// ── Step 1: Ask for a username ──
	conn.Write([]byte("╔══════════════════════════════════╗\n"))
	conn.Write([]byte("║      Go Real-Time Chat Server    ║\n"))
	conn.Write([]byte("╚══════════════════════════════════╝\n"))
	conn.Write([]byte("Enter your username: "))

	username, err := reader.ReadString('\n')
	if err != nil {
		return
	}
	username = strings.TrimSpace(username)
	if username == "" {
		username = fmt.Sprintf("user_%d", time.Now().UnixNano()%10000)
	}

	client := &Client{
		conn:     conn,
		username: username,
		send:     make(chan string, 64),
	}

	// ── Step 2: Send help text ──
	help := `
Commands:
  /join  <room>    — join or create a room
  /rooms           — list all rooms
  /users           — list users in current room
  /msg   <user> <text>  — private message
  /quit            — disconnect

Everything else is a message to your current room.
`
	client.send <- help

	// ── Step 3: Auto-join lobby ──
	s.joinRoom(client, "lobby")

	// ── Step 4: Writer goroutine ──
	go func() {
		for msg := range client.send {
			conn.Write([]byte(msg + "\n"))
		}
	}()

	log.Printf("[SERVER] New connection: %s (%s)", username, conn.RemoteAddr())

	// ── Step 5: Read loop ──
	for {
		conn.SetReadDeadline(time.Now().Add(30 * time.Minute))
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		switch {
		case line == "/quit":
			client.send <- "👋  Goodbye!"
			goto disconnect

		case line == "/rooms":
			client.send <- s.listRooms()

		case line == "/users":
			if client.room == "" {
				client.send <- "❌  You're not in a room. Use /join <room>"
			} else {
				client.send <- s.listUsers(client.room)
			}

		case strings.HasPrefix(line, "/join "):
			roomName := strings.TrimPrefix(line, "/join ")
			roomName = strings.TrimSpace(strings.ToLower(roomName))
			if roomName == "" {
				client.send <- "❌  Usage: /join <room>"
			} else {
				s.joinRoom(client, roomName)
			}

		case strings.HasPrefix(line, "/msg "):
			// Private message: /msg <username> <text>
			parts := strings.SplitN(strings.TrimPrefix(line, "/msg "), " ", 2)
			if len(parts) < 2 {
				client.send <- "❌  Usage: /msg <username> <message>"
				continue
			}
			target, text := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
			delivered := false

			s.mu.RLock()
			for _, room := range s.rooms {
				room.mu.RLock()
				for c := range room.clients {
					if strings.EqualFold(c.username, target) {
						c.send <- fmt.Sprintf("🔒  [DM from %s]: %s", client.username, text)
						delivered = true
					}
				}
				room.mu.RUnlock()
			}
			s.mu.RUnlock()

			if delivered {
				client.send <- fmt.Sprintf("🔒  [DM to %s]: %s", target, text)
			} else {
				client.send <- fmt.Sprintf("❌  User '%s' not found.", target)
			}

		default:
			// Regular room message
			if client.room == "" {
				client.send <- "❌  Join a room first: /join <room>"
				continue
			}
			timestamp := time.Now().Format("15:04:05")
			msg := fmt.Sprintf("[%s] <%s> %s", timestamp, client.username, line)
			log.Printf("#%s %s", client.room, msg)

			s.mu.RLock()
			room, ok := s.rooms[client.room]
			s.mu.RUnlock()
			if ok {
				s.broadcastToRoom(room, msg, client)
				client.send <- fmt.Sprintf("[%s] <you> %s", timestamp, line)
			}
		}
	}

disconnect:
	s.leaveRoom(client)
	close(client.send)
	log.Printf("[SERVER] Disconnected: %s", username)
}

// ─────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────

func main() {
	address := ":8080"
	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
	defer listener.Close()

	server := newServer()

	log.Printf("🚀  Chat server listening on %s", address)
	log.Printf("    Connect with:  telnet localhost 8080")
	log.Printf("    or:            nc localhost 8080")

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Accept error: %v", err)
			continue
		}
		go server.handleClient(conn)
	}
}
