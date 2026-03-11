from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        hostname = os.uname().nodename
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Users Service</title>
            <style>
                body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; text-align: center; padding: 50px; }
                h1 { color: #4ecca3; font-size: 3em; }
                .card { background: #16213e; padding: 20px; margin: 20px auto; max-width: 500px; border-radius: 10px; }
                table { width: 100%%; border-collapse: collapse; margin-top: 15px; }
                th { background: #4ecca3; color: black; padding: 10px; }
                td { padding: 10px; border-bottom: 1px solid #333; }
                .badge { background: #4ecca3; color: black; padding: 3px 10px; border-radius: 10px; font-size: 0.8em; }
                a { color: #4ecca3; }
            </style>
        </head>
        <body>
            <h1>👤 Users Service</h1>
            <div class="card">
                <p>Running on pod: <b>""" + hostname + """</b></p>
                <p>Service: <b>users-service</b> | Port: <b>5001</b></p>
                <table>
                    <tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th></tr>
                    <tr><td>1</td><td>Alice</td><td>alice@demo.com</td><td><span class="badge">Admin</span></td></tr>
                    <tr><td>2</td><td>Bob</td><td>bob@demo.com</td><td><span class="badge">User</span></td></tr>
                    <tr><td>3</td><td>Charlie</td><td>charlie@demo.com</td><td><span class="badge">User</span></td></tr>
                </table>
            </div>
            <a href="/" style="color:#4ecca3">← Back to Home</a>
        </body>
        </html>
        """
        self.wfile.write(html.encode())
    def log_message(self, format, *args):
        print(f"[USERS] {args[0]} {args[1]}")

if __name__ == "__main__":
    print("Users service running on port 5001...")
    HTTPServer(("0.0.0.0", 5001), Handler).serve_forever()
