from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Demo Shop</title>
            <style>
                body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; text-align: center; padding: 50px; }
                h1 { color: #e94560; font-size: 3em; }
                .card { background: #16213e; padding: 20px; margin: 20px auto; max-width: 400px; border-radius: 10px; }
                a { color: #0f3460; background: #e94560; padding: 10px 20px; border-radius: 5px; text-decoration: none; margin: 10px; display: inline-block; }
                a:hover { background: #c73652; }
            </style>
        </head>
        <body>
            <h1>🛒 Demo Shop</h1>
            <div class="card">
                <h2>Welcome to Demo Shop!</h2>
                <p>This is the <b>Frontend Service</b> running in Kubernetes</p>
                <p>Pod: <b>frontend-service</b></p>
            </div>
            <div class="card">
                <h3>Navigate to other services:</h3>
                <a href="/users">👤 Users Service</a>
                <a href="/orders">📦 Orders Service</a>
            </div>
        </body>
        </html>
        """
        self.wfile.write(html.encode())
    def log_message(self, format, *args):
        print(f"[FRONTEND] {args[0]} {args[1]}")

if __name__ == "__main__":
    print("Frontend running on port 5000...")
    HTTPServer(("0.0.0.0", 5000), Handler).serve_forever()
