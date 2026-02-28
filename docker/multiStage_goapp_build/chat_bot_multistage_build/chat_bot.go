package main

import (
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ═══════════════════════════════════════════════════════════
//  DATA STRUCTURES
// ═══════════════════════════════════════════════════════════

type Client struct {
	conn     net.Conn
	ws       *WSConn
	username string
	room     string
	send     chan string
	isWeb    bool
}

type Room struct {
	name    string
	clients map[*Client]bool
	mu      sync.RWMutex
}

type Server struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

type WSMessage struct {
	Type   string `json:"type"`
	Room   string `json:"room"`
	Text   string `json:"text"`
	Target string `json:"target"`
}

type WSEvent struct {
	Type  string     `json:"type"`
	From  string     `json:"from"`
	Text  string     `json:"text"`
	Room  string     `json:"room"`
	Time  string     `json:"time"`
	Users []string   `json:"users,omitempty"`
	Rooms []RoomInfo `json:"rooms,omitempty"`
}

type RoomInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// ═══════════════════════════════════════════════════════════
//  SERVER LOGIC  (shared by TCP and WebSocket clients)
// ═══════════════════════════════════════════════════════════

func newServer() *Server {
	s := &Server{rooms: make(map[string]*Room)}
	s.rooms["lobby"] = &Room{name: "lobby", clients: make(map[*Client]bool)}
	return s
}

func (s *Server) getOrCreateRoom(name string) *Room {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.rooms[name]; ok {
		return r
	}
	r := &Room{name: name, clients: make(map[*Client]bool)}
	s.rooms[name] = r
	return r
}

func sendTo(c *Client, msg string) {
	select {
	case c.send <- msg:
	default:
	}
}

func systemMsg(c *Client, text string) {
	if c.isWeb {
		ev := WSEvent{Type: "system", Text: text, Time: time.Now().Format("15:04:05")}
		b, _ := json.Marshal(ev)
		sendTo(c, string(b))
	} else {
		sendTo(c, text)
	}
}

func (s *Server) broadcastToRoom(room *Room, text, from string, sender *Client) {
	ts := time.Now().Format("15:04:05")
	ev := WSEvent{Type: "msg", From: from, Text: text, Room: room.name, Time: ts}
	jsonBytes, _ := json.Marshal(ev)
	jsonStr := string(jsonBytes)
	plainStr := fmt.Sprintf("[%s] <%s> %s", ts, from, text)

	room.mu.RLock()
	defer room.mu.RUnlock()
	for c := range room.clients {
		if c == sender {
			continue
		}
		if c.isWeb {
			sendTo(c, jsonStr)
		} else {
			sendTo(c, plainStr)
		}
	}
}

func (s *Server) systemBroadcast(room *Room, text string, sender *Client) {
	ev := WSEvent{Type: "system", Text: text, Time: time.Now().Format("15:04:05")}
	b, _ := json.Marshal(ev)
	jsonStr := string(b)
	room.mu.RLock()
	defer room.mu.RUnlock()
	for c := range room.clients {
		if c == sender {
			continue
		}
		if c.isWeb {
			sendTo(c, jsonStr)
		} else {
			sendTo(c, text)
		}
	}
}

func (s *Server) joinRoom(c *Client, roomName string) {
	if c.room != "" {
		s.leaveRoom(c)
	}
	room := s.getOrCreateRoom(roomName)
	room.mu.Lock()
	room.clients[c] = true
	room.mu.Unlock()
	c.room = roomName
	systemMsg(c, fmt.Sprintf("✅ Joined #%s", roomName))
	s.systemBroadcast(room, fmt.Sprintf("📢 %s joined #%s", c.username, roomName), c)
	if c.isWeb {
		s.sendUserList(c)
	}
	log.Printf("[%s] joined #%s", c.username, roomName)
}

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
	s.systemBroadcast(room, fmt.Sprintf("🚪 %s left #%s", c.username, c.room), c)
	log.Printf("[%s] left #%s", c.username, c.room)
	c.room = ""
}

func (s *Server) sendRoomList(c *Client) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if c.isWeb {
		var rooms []RoomInfo
		for name, room := range s.rooms {
			room.mu.RLock()
			rooms = append(rooms, RoomInfo{Name: name, Count: len(room.clients)})
			room.mu.RUnlock()
		}
		ev := WSEvent{Type: "rooms", Rooms: rooms}
		b, _ := json.Marshal(ev)
		sendTo(c, string(b))
	} else {
		var sb strings.Builder
		sb.WriteString("📋  Active rooms:\n")
		for name, room := range s.rooms {
			room.mu.RLock()
			count := len(room.clients)
			room.mu.RUnlock()
			sb.WriteString(fmt.Sprintf("   #%-15s  (%d users)\n", name, count))
		}
		sendTo(c, sb.String())
	}
}

func (s *Server) sendUserList(c *Client) {
	s.mu.RLock()
	room, ok := s.rooms[c.room]
	s.mu.RUnlock()
	if !ok {
		systemMsg(c, "❌ Not in a room.")
		return
	}
	room.mu.RLock()
	defer room.mu.RUnlock()
	if c.isWeb {
		var users []string
		for u := range room.clients {
			users = append(users, u.username)
		}
		ev := WSEvent{Type: "users", Users: users, Room: c.room}
		b, _ := json.Marshal(ev)
		sendTo(c, string(b))
	} else {
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("👥  Users in #%s:\n", c.room))
		for u := range room.clients {
			sb.WriteString(fmt.Sprintf("   • %s\n", u.username))
		}
		sendTo(c, sb.String())
	}
}

func (s *Server) privateMsgTo(sender *Client, target, text string) {
	delivered := false
	s.mu.RLock()
	for _, room := range s.rooms {
		room.mu.RLock()
		for c := range room.clients {
			if strings.EqualFold(c.username, target) {
				if c.isWeb {
					ev := WSEvent{Type: "dm", From: sender.username, Text: text, Time: time.Now().Format("15:04:05")}
					b, _ := json.Marshal(ev)
					sendTo(c, string(b))
				} else {
					sendTo(c, fmt.Sprintf("🔒 [DM from %s]: %s", sender.username, text))
				}
				delivered = true
			}
		}
		room.mu.RUnlock()
	}
	s.mu.RUnlock()
	if delivered {
		if sender.isWeb {
			ev := WSEvent{Type: "dm", From: "you → " + target, Text: text, Time: time.Now().Format("15:04:05")}
			b, _ := json.Marshal(ev)
			sendTo(sender, string(b))
		} else {
			sendTo(sender, fmt.Sprintf("🔒 [DM to %s]: %s", target, text))
		}
	} else {
		systemMsg(sender, fmt.Sprintf("❌ User '%s' not found.", target))
	}
}

// ═══════════════════════════════════════════════════════════
//  PROTOCOL DETECTOR  — the secret sauce
//  Peeks at the first byte of every new connection.
//  'G' (0x47) → starts with "GET " → HTTP/WebSocket
//  Anything else → raw TCP chat client
// ═══════════════════════════════════════════════════════════

// peekConn lets us read one byte, then put it back so nothing is lost.
type peekConn struct {
	net.Conn
	peeked []byte
	done   bool
}

func (p *peekConn) Read(b []byte) (int, error) {
	if !p.done && len(p.peeked) > 0 {
		n := copy(b, p.peeked)
		p.peeked = p.peeked[n:]
		if len(p.peeked) == 0 {
			p.done = true
		}
		return n, nil
	}
	return p.Conn.Read(b)
}

func detectAndRoute(conn net.Conn, s *Server, httpHandler http.Handler) {
	// Read first byte to detect protocol
	buf := make([]byte, 1)
	_, err := conn.Read(buf)
	if err != nil {
		conn.Close()
		return
	}

	// Wrap connection so the first byte is replayed on subsequent reads
	pc := &peekConn{Conn: conn, peeked: buf}

	if buf[0] == 'G' {
		// Looks like "GET ..." — route to HTTP handler
		httpHandler.ServeHTTP(&hijackResponseWriter{conn: conn, pc: pc}, buildHTTPRequest(pc))
	} else {
		// Raw TCP chat client
		s.handleTCPClient(pc)
	}
}

// ═══════════════════════════════════════════════════════════
//  TCP CLIENT  (nc / telnet)
// ═══════════════════════════════════════════════════════════

func readLine(conn net.Conn) (string, error) {
	var buf []byte
	b := make([]byte, 1)
	for {
		_, err := conn.Read(b)
		if err != nil {
			return "", err
		}
		ch := b[0]
		switch {
		case ch == 0xff: // Telnet IAC
			skip := make([]byte, 2)
			conn.Read(skip)
		case ch == '\n':
			conn.Write([]byte("\r\n"))
			return strings.TrimRight(string(buf), "\r"), nil
		case ch == '\r':
			continue
		case ch == 0x7f || ch == 0x08: // Backspace
			if len(buf) > 0 {
				buf = buf[:len(buf)-1]
				conn.Write([]byte("\b \b"))
			}
		case ch >= 0x20 && ch < 0x7f:
			buf = append(buf, ch)
			conn.Write(b)
		}
	}
}

func (s *Server) handleTCPClient(conn net.Conn) {
	defer conn.Close()

	conn.Write([]byte("╔══════════════════════════════════╗\r\n"))
	conn.Write([]byte("║      Go Real-Time Chat Server    ║\r\n"))
	conn.Write([]byte("╚══════════════════════════════════╝\r\n"))
	conn.Write([]byte("Enter your username: "))

	username, err := readLine(conn)
	if err != nil {
		return
	}
	username = strings.TrimSpace(username)
	if username == "" {
		username = fmt.Sprintf("user_%d", time.Now().UnixNano()%10000)
	}

	c := &Client{conn: conn, username: username, send: make(chan string, 64)}

	help := "\r\nCommands:\r\n" +
		"  /join <room>         — join or create a room\r\n" +
		"  /rooms               — list all rooms\r\n" +
		"  /users               — list users in current room\r\n" +
		"  /msg <user> <text>   — private message\r\n" +
		"  /quit                — disconnect\r\n\r\n"
	sendTo(c, help)

	s.joinRoom(c, "lobby")

	go func() {
		for msg := range c.send {
			conn.Write([]byte(msg + "\r\n"))
		}
	}()

	log.Printf("[TCP] Connected: %s (%s)", username, conn.RemoteAddr())

	for {
		conn.SetReadDeadline(time.Now().Add(30 * time.Minute))
		line, err := readLine(conn)
		if err != nil {
			break
		}
		if line == "" {
			continue
		}
		switch {
		case line == "/quit":
			sendTo(c, "👋 Goodbye!")
			goto done
		case line == "/rooms":
			s.sendRoomList(c)
		case line == "/users":
			if c.room == "" {
				sendTo(c, "❌ Join a room first.")
			} else {
				s.sendUserList(c)
			}
		case strings.HasPrefix(line, "/join "):
			name := strings.TrimSpace(strings.TrimPrefix(line, "/join "))
			if name == "" {
				sendTo(c, "❌ Usage: /join <room>")
			} else {
				s.joinRoom(c, strings.ToLower(name))
			}
		case strings.HasPrefix(line, "/msg "):
			parts := strings.SplitN(strings.TrimPrefix(line, "/msg "), " ", 2)
			if len(parts) < 2 {
				sendTo(c, "❌ Usage: /msg <user> <text>")
			} else {
				s.privateMsgTo(c, strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
			}
		default:
			if c.room == "" {
				sendTo(c, "❌ Join a room first: /join <room>")
				continue
			}
			s.mu.RLock()
			room, ok := s.rooms[c.room]
			s.mu.RUnlock()
			if ok {
				s.broadcastToRoom(room, line, c.username, c)
				ts := time.Now().Format("15:04:05")
				sendTo(c, fmt.Sprintf("[%s] <you> %s", ts, line))
			}
		}
	}
done:
	s.leaveRoom(c)
	close(c.send)
	log.Printf("[TCP] Disconnected: %s", username)
}

// ═══════════════════════════════════════════════════════════
//  WEBSOCKET  (RFC 6455, stdlib only)
// ═══════════════════════════════════════════════════════════

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

type WSConn struct {
	conn net.Conn
	mu   sync.Mutex
}

// readFull reads exactly len(buf) bytes.
func readFull(conn net.Conn, buf []byte) error {
	total := 0
	for total < len(buf) {
		n, err := conn.Read(buf[total:])
		total += n
		if err != nil {
			return err
		}
	}
	return nil
}

func (ws *WSConn) ReadMessage() (string, error) {
	header := make([]byte, 2)
	if err := readFull(ws.conn, header); err != nil {
		return "", err
	}
	opcode := header[0] & 0x0f
	if opcode == 0x8 {
		return "", fmt.Errorf("ws close")
	}
	masked := (header[1] & 0x80) != 0
	payloadLen := int(header[1] & 0x7f)
	if payloadLen == 126 {
		ext := make([]byte, 2)
		if err := readFull(ws.conn, ext); err != nil {
			return "", err
		}
		payloadLen = int(binary.BigEndian.Uint16(ext))
	} else if payloadLen == 127 {
		ext := make([]byte, 8)
		if err := readFull(ws.conn, ext); err != nil {
			return "", err
		}
		payloadLen = int(binary.BigEndian.Uint64(ext))
	}
	var maskKey [4]byte
	if masked {
		if err := readFull(ws.conn, maskKey[:]); err != nil {
			return "", err
		}
	}
	payload := make([]byte, payloadLen)
	if err := readFull(ws.conn, payload); err != nil {
		return "", err
	}
	if masked {
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}
	}
	return string(payload), nil
}

func (ws *WSConn) WriteMessage(msg string) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	data := []byte(msg)
	length := len(data)
	var frame []byte
	frame = append(frame, 0x81)
	switch {
	case length <= 125:
		frame = append(frame, byte(length))
	case length <= 65535:
		frame = append(frame, 126, byte(length>>8), byte(length))
	default:
		l := make([]byte, 8)
		binary.BigEndian.PutUint64(l, uint64(length))
		frame = append(frame, 127)
		frame = append(frame, l...)
	}
	frame = append(frame, data...)
	_, err := ws.conn.Write(frame)
	return err
}

func (ws *WSConn) Close() { ws.conn.Close() }

// wsUpgrade performs the WebSocket handshake over a raw conn.
func wsUpgrade(conn net.Conn, key string) (*WSConn, error) {
	h := sha1.New()
	h.Write([]byte(key + wsGUID))
	accept := base64.StdEncoding.EncodeToString(h.Sum(nil))
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	_, err := conn.Write([]byte(resp))
	if err != nil {
		return nil, err
	}
	return &WSConn{conn: conn}, nil
}

func (s *Server) handleWSClient(conn net.Conn, wsKey string) {
	ws, err := wsUpgrade(conn, wsKey)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}
	defer ws.Close()

	c := &Client{ws: ws, send: make(chan string, 64), isWeb: true}

	go func() {
		for msg := range c.send {
			ws.WriteMessage(msg)
		}
	}()

	// First message must be login
	raw, err := ws.ReadMessage()
	if err != nil {
		return
	}
	var init WSMessage
	json.Unmarshal([]byte(raw), &init)
	username := strings.TrimSpace(init.Text)
	if username == "" {
		username = fmt.Sprintf("user_%d", time.Now().UnixNano()%10000)
	}
	c.username = username

	s.joinRoom(c, "lobby")
	s.sendRoomList(c)
	log.Printf("[WS] Connected: %s (%s)", username, conn.RemoteAddr())

	for {
		raw, err := ws.ReadMessage()
		if err != nil {
			break
		}
		var msg WSMessage
		if err := json.Unmarshal([]byte(raw), &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "msg":
			if c.room == "" {
				systemMsg(c, "❌ Join a room first.")
				continue
			}
			s.mu.RLock()
			room, ok := s.rooms[c.room]
			s.mu.RUnlock()
			if ok {
				s.broadcastToRoom(room, msg.Text, c.username, c)
				ev := WSEvent{Type: "msg", From: "you", Text: msg.Text, Room: c.room, Time: time.Now().Format("15:04:05")}
				b, _ := json.Marshal(ev)
				sendTo(c, string(b))
			}
		case "join":
			name := strings.ToLower(strings.TrimSpace(msg.Room))
			if name != "" {
				s.joinRoom(c, name)
				s.sendRoomList(c)
			}
		case "rooms":
			s.sendRoomList(c)
		case "users":
			s.sendUserList(c)
		case "dm":
			s.privateMsgTo(c, msg.Target, msg.Text)
		}
	}

	s.leaveRoom(c)
	close(c.send)
	log.Printf("[WS] Disconnected: %s", username)
}

// ═══════════════════════════════════════════════════════════
//  MINIMAL HTTP ROUTER  (serves UI + routes /ws upgrades)
//  Parses raw HTTP requests directly from the TCP conn.
// ═══════════════════════════════════════════════════════════

func serveHTTP(conn net.Conn, s *Server, firstByte byte) {
	defer func() {
		// Only close if not hijacked for WebSocket
		recover()
	}()

	// Read the rest of the HTTP request line by line
	buf := make([]byte, 4096)
	buf[0] = firstByte
	n := 1

	// Read until we get \r\n\r\n (end of HTTP headers)
	tmp := make([]byte, 1)
	for n < len(buf)-1 {
		nr, err := conn.Read(tmp)
		if err != nil || nr == 0 {
			break
		}
		buf[n] = tmp[0]
		n++
		if n >= 4 &&
			buf[n-4] == '\r' && buf[n-3] == '\n' &&
			buf[n-2] == '\r' && buf[n-1] == '\n' {
			break
		}
	}

	req := string(buf[:n])
	lines := strings.Split(req, "\r\n")
	if len(lines) == 0 {
		conn.Close()
		return
	}

	// Parse request line: "GET /path HTTP/1.1"
	parts := strings.Fields(lines[0])
	if len(parts) < 2 {
		conn.Close()
		return
	}
	path := parts[1]

	// Parse headers into a map
	headers := map[string]string{}
	for _, line := range lines[1:] {
		if idx := strings.Index(line, ":"); idx > 0 {
			k := strings.ToLower(strings.TrimSpace(line[:idx]))
			v := strings.TrimSpace(line[idx+1:])
			headers[k] = v
		}
	}

	// Route: WebSocket upgrade
	if path == "/ws" {
		upgrade := strings.ToLower(headers["upgrade"])
		wsKey := headers["sec-websocket-key"]
		if upgrade == "websocket" && wsKey != "" {
			go s.handleWSClient(conn, wsKey)
			return
		}
		writeHTTP(conn, 400, "Bad WebSocket request")
		conn.Close()
		return
	}

	// Route: Web UI
	if path == "/" || path == "/index.html" {
		writeHTTPHTML(conn, htmlUI)
		conn.Close()
		return
	}

	writeHTTP(conn, 404, "Not Found")
	conn.Close()
}

func writeHTTP(conn net.Conn, code int, body string) {
	resp := fmt.Sprintf("HTTP/1.1 %d %s\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",
		code, http.StatusText(code), len(body), body)
	conn.Write([]byte(resp))
}

func writeHTTPHTML(conn net.Conn, body string) {
	resp := fmt.Sprintf("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",
		len(body), body)
	conn.Write([]byte(resp))
}

// Stub types to satisfy old code paths — not used in new design
type hijackResponseWriter struct {
	conn net.Conn
	pc   net.Conn
}

func (h *hijackResponseWriter) Header() http.Header        { return http.Header{} }
func (h *hijackResponseWriter) Write(b []byte) (int, error) { return h.conn.Write(b) }
func (h *hijackResponseWriter) WriteHeader(int)             {}

func buildHTTPRequest(conn net.Conn) *http.Request { return nil }

// ═══════════════════════════════════════════════════════════
//  EMBEDDED WEB UI
// ═══════════════════════════════════════════════════════════

const htmlUI = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Go Chat</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f1117;color:#e2e8f0;height:100vh;display:flex;flex-direction:column}
#login{position:fixed;inset:0;background:#0f1117;display:flex;align-items:center;justify-content:center;z-index:99}
.login-box{background:#1a1d27;border:1px solid #2d3148;border-radius:16px;padding:40px;width:340px;text-align:center}
.login-box h1{font-size:1.6rem;margin-bottom:6px;color:#7c83fd}
.login-box p{color:#8892b0;font-size:.9rem;margin-bottom:24px}
.login-box input{width:100%;padding:12px 16px;border-radius:8px;border:1px solid #2d3148;background:#0f1117;color:#e2e8f0;font-size:1rem;outline:none;margin-bottom:14px}
.login-box input:focus{border-color:#7c83fd}
.login-box button{width:100%;padding:12px;border-radius:8px;border:none;background:#7c83fd;color:#fff;font-size:1rem;cursor:pointer;font-weight:600}
.login-box button:hover{background:#6269e0}
#app{display:none;flex:1;overflow:hidden;flex-direction:column}
#app.visible{display:flex}
header{padding:14px 20px;background:#1a1d27;border-bottom:1px solid #2d3148;display:flex;align-items:center;justify-content:space-between}
header h2{font-size:1.1rem;color:#7c83fd}
#room-badge{font-size:.8rem;background:#2d3148;padding:4px 10px;border-radius:20px;color:#a0aec0}
.shell{display:flex;flex:1;overflow:hidden}
aside{width:210px;background:#1a1d27;border-right:1px solid #2d3148;display:flex;flex-direction:column;padding:16px 0;overflow-y:auto}
aside h3{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:#4a5568;padding:0 16px 8px}
.room-item{padding:8px 16px;cursor:pointer;font-size:.88rem;color:#a0aec0;display:flex;align-items:center;gap:8px;border-left:3px solid transparent;transition:.15s}
.room-item:hover{background:#252839;color:#e2e8f0}
.room-item.active{background:#252839;color:#7c83fd;border-left-color:#7c83fd}
.room-item .badge{margin-left:auto;background:#2d3148;border-radius:10px;padding:1px 7px;font-size:.7rem}
.divider{height:1px;background:#2d3148;margin:10px 0}
#user-list{padding:0 16px;font-size:.85rem;color:#718096}
#user-list li{list-style:none;padding:4px 0;display:flex;align-items:center;gap:8px}
#user-list li::before{content:'';width:7px;height:7px;border-radius:50%;background:#48bb78;flex-shrink:0}
main{flex:1;display:flex;flex-direction:column;overflow:hidden}
#messages{flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:8px}
#messages::-webkit-scrollbar{width:5px}
#messages::-webkit-scrollbar-thumb{background:#2d3148;border-radius:4px}
.msg{display:flex;flex-direction:column;max-width:72%;animation:fadeIn .18s ease}
.msg.self{align-self:flex-end;align-items:flex-end}
.msg.other{align-self:flex-start}
.msg.system{align-self:center;max-width:95%}
.msg.dm{align-self:center;max-width:90%}
@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.bubble{padding:10px 14px;border-radius:14px;font-size:.92rem;line-height:1.5;word-break:break-word}
.msg.self .bubble{background:#7c83fd;color:#fff;border-bottom-right-radius:4px}
.msg.other .bubble{background:#252839;color:#e2e8f0;border-bottom-left-radius:4px}
.msg.system .bubble{background:transparent;color:#4a5568;font-size:.8rem;font-style:italic;text-align:center;padding:2px 0}
.msg.dm .bubble{background:#1e3a5f;color:#90cdf4;border-radius:10px;font-size:.88rem}
.meta{font-size:.7rem;color:#4a5568;margin:2px 6px}
.input-bar{padding:14px 20px;background:#1a1d27;border-top:1px solid #2d3148;display:flex;gap:10px;align-items:center}
#msg-input{flex:1;padding:12px 16px;border-radius:10px;border:1px solid #2d3148;background:#0f1117;color:#e2e8f0;font-size:.95rem;outline:none;resize:none;height:46px;font-family:inherit}
#msg-input:focus{border-color:#7c83fd}
.send-btn{padding:0 22px;height:46px;border-radius:10px;border:none;background:#7c83fd;color:#fff;font-size:.95rem;cursor:pointer;font-weight:600}
.send-btn:hover{background:#6269e0}
.new-room-btn{margin:8px 12px 0;padding:8px;border-radius:8px;border:1px dashed #2d3148;background:transparent;color:#4a5568;font-size:.82rem;cursor:pointer;text-align:center}
.new-room-btn:hover{border-color:#7c83fd;color:#7c83fd}
#dm-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:50;align-items:center;justify-content:center}
#dm-modal.open{display:flex}
.dm-box{background:#1a1d27;border:1px solid #2d3148;border-radius:12px;padding:24px;width:300px}
.dm-box h3{margin-bottom:14px;color:#90cdf4;font-size:1rem}
.dm-box input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #2d3148;background:#0f1117;color:#e2e8f0;margin-bottom:10px;outline:none;font-size:.9rem}
.dm-box input:focus{border-color:#7c83fd}
.dm-box .actions{display:flex;gap:8px;margin-top:4px}
.dm-box button{flex:1;padding:10px;border-radius:8px;border:none;cursor:pointer;font-weight:600;font-size:.9rem}
.dm-box .send{background:#7c83fd;color:#fff}
.dm-box .cancel{background:#2d3148;color:#a0aec0}
</style>
</head>
<body>

<div id="login">
  <div class="login-box">
    <h1>💬 Go Chat</h1>
    <p>Real-time · TCP + WebSocket · Pure Go</p>
    <input id="username-input" type="text" placeholder="Enter your username..." maxlength="20" autofocus/>
    <button onclick="connect()">Join Chat →</button>
  </div>
</div>

<div id="app">
  <header>
    <h2>💬 Go Chat</h2>
    <div style="display:flex;align-items:center;gap:10px">
      <span id="room-badge">#lobby</span>
      <button onclick="openDM()" style="padding:6px 12px;border-radius:8px;border:none;background:#2d3148;color:#a0aec0;cursor:pointer;font-size:.8rem">✉ DM</button>
    </div>
  </header>
  <div class="shell">
    <aside>
      <h3>Rooms</h3>
      <div id="room-list"></div>
      <button class="new-room-btn" onclick="promptNewRoom()">+ New Room</button>
      <div class="divider"></div>
      <h3>Online</h3>
      <ul id="user-list"></ul>
    </aside>
    <main>
      <div id="messages"></div>
      <div class="input-bar">
        <textarea id="msg-input" placeholder="Message #lobby … (Enter to send)"></textarea>
        <button class="send-btn" onclick="sendMsg()">Send</button>
      </div>
    </main>
  </div>
</div>

<div id="dm-modal">
  <div class="dm-box">
    <h3>📩 Private Message</h3>
    <input id="dm-target" type="text" placeholder="Recipient username"/>
    <input id="dm-text"   type="text" placeholder="Your message…"/>
    <div class="actions">
      <button class="cancel" onclick="closeDM()">Cancel</button>
      <button class="send"   onclick="sendDM()">Send</button>
    </div>
  </div>
</div>

<script>
let ws, myName, myRoom = 'lobby';

function connect() {
  const name = document.getElementById('username-input').value.trim();
  if (!name) return;
  myName = name;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'login', text: name }));
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').classList.add('visible');
  };
  ws.onmessage = e => {
    const ev = JSON.parse(e.data);
    if      (ev.type === 'msg')    appendMsg(ev);
    else if (ev.type === 'system') appendSystem(ev.text);
    else if (ev.type === 'dm')     appendDM(ev);
    else if (ev.type === 'rooms')  renderRooms(ev.rooms);
    else if (ev.type === 'users')  renderUsers(ev.users);
  };
  ws.onclose = () => appendSystem('🔴 Disconnected.');
  ws.onerror = () => appendSystem('⚠️ Connection error.');
}

function sendMsg() {
  const inp = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'msg', text }));
  inp.value = '';
  inp.focus();
}

function joinRoom(name) {
  myRoom = name;
  document.getElementById('room-badge').textContent = '#' + name;
  document.getElementById('msg-input').placeholder = 'Message #' + name + ' …';
  ws.send(JSON.stringify({ type: 'join', room: name }));
  ws.send(JSON.stringify({ type: 'users' }));
  clearMessages();
}

function promptNewRoom() {
  const name = prompt('New room name:');
  if (name && name.trim()) joinRoom(name.trim().toLowerCase());
}

function openDM()  { document.getElementById('dm-modal').classList.add('open'); document.getElementById('dm-target').focus(); }
function closeDM() { document.getElementById('dm-modal').classList.remove('open'); }

function sendDM() {
  const target = document.getElementById('dm-target').value.trim();
  const text   = document.getElementById('dm-text').value.trim();
  if (!target || !text) return;
  ws.send(JSON.stringify({ type: 'dm', target, text }));
  document.getElementById('dm-target').value = '';
  document.getElementById('dm-text').value = '';
  closeDM();
}

function appendMsg(ev) {
  const isSelf = ev.from === 'you';
  const div = document.createElement('div');
  div.className = 'msg ' + (isSelf ? 'self' : 'other');
  div.innerHTML = '<div class="bubble">' + esc(ev.text) + '</div><span class="meta">' + esc(ev.from) + ' · ' + ev.time + '</span>';
  push(div);
}
function appendSystem(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.innerHTML = '<div class="bubble">' + esc(text) + '</div>';
  push(div);
}
function appendDM(ev) {
  const div = document.createElement('div');
  div.className = 'msg dm';
  div.innerHTML = '<div class="bubble">🔒 <strong>' + esc(ev.from) + '</strong>: ' + esc(ev.text) + '</div>';
  push(div);
}
function renderRooms(rooms) {
  const el = document.getElementById('room-list');
  el.innerHTML = '';
  (rooms || []).sort((a,b)=>a.name.localeCompare(b.name)).forEach(r => {
    const d = document.createElement('div');
    d.className = 'room-item' + (r.name === myRoom ? ' active' : '');
    d.onclick = () => joinRoom(r.name);
    d.innerHTML = '<span># ' + esc(r.name) + '</span><span class="badge">' + r.count + '</span>';
    el.appendChild(d);
  });
}
function renderUsers(users) {
  document.getElementById('user-list').innerHTML = (users||[]).map(u=>'<li>'+esc(u)+'</li>').join('');
}
function push(el) {
  const box = document.getElementById('messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
function clearMessages() { document.getElementById('messages').innerHTML = ''; }
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') connect();
  });
  document.getElementById('dm-text').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendDM();
  });
  document.getElementById('dm-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('dm-modal')) closeDM();
  });
});
</script>
</body>
</html>`

// ═══════════════════════════════════════════════════════════
//  MAIN — single port, auto-detect protocol
// ═══════════════════════════════════════════════════════════

func main() {
	const addr = ":8080"

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Listen error: %v", err)
	}
	defer ln.Close()

	server := newServer()

	log.Println("🚀  Chat server on :8080  (single port, auto-detect protocol)")
	log.Println()
	log.Println("   Browser  : http://localhost:8080")
	log.Println("   Terminal : nc localhost 8080")
	log.Println()
	log.Println("   TCP and Web clients share the same rooms ✨")

	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("Accept error: %v", err)
			continue
		}

		go func(c net.Conn) {
			// Peek at the first byte
			buf := make([]byte, 1)
			_, err := c.Read(buf)
			if err != nil {
				c.Close()
				return
			}

			// Wrap so the first byte is replayed
			pc := &peekConn{Conn: c, peeked: buf}

			if buf[0] == 'G' {
				// Starts with 'G' → likely "GET ..." → HTTP / WebSocket
				serveHTTP(pc, server, buf[0])
			} else {
				// Raw TCP chat client (nc, telnet)
				server.handleTCPClient(pc)
			}
		}(conn)
	}
}
