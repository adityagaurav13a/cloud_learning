from http.server import HTTPServer, BaseHTTPRequestHandler
import os

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
            <title>Orders Service</title>
            <style>
                body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; text-align: center; padding: 50px; }
                h1 { color: #f5a623; font-size: 3em; }
                .card { background: #16213e; padding: 20px; margin: 20px auto; max-width: 550px; border-radius: 10px; }
                table { width: 100%%; border-collapse: collapse; margin-top: 15px; }
                th { background: #f5a623; color: black; padding: 10px; }
                td { padding: 10px; border-bottom: 1px solid #333; }
                .status-delivered { color: #4ecca3; }
                .status-pending { color: #f5a623; }
                .status-shipped { color: #64b5f6; }
            </style>
        </head>
        <body>
            <h1>📦 Orders Service</h1>
            <div class="card">
                <p>Running on pod: <b>""" + hostname + """</b></p>
                <p>Service: <b>orders-service</b> | Port: <b>5002</b></p>
                <table>
                    <tr><th>Order ID</th><th>Customer</th><th>Item</th><th>Status</th></tr>
                    <tr><td>#1001</td><td>Alice</td><td>Laptop</td><td class="status-delivered">✅ Delivered</td></tr>
                    <tr><td>#1002</td><td>Bob</td><td>Phone</td><td class="status-shipped">🚚 Shipped</td></tr>
                    <tr><td>#1003</td><td>Charlie</td><td>Headphones</td><td class="status-pending">⏳ Pending</td></tr>
                    <tr><td>#1004</td><td>Alice</td><td>Keyboard</td><td class="status-delivered">✅ Delivered</td></tr>
                </table>
            </div>
            <a href="/" style="color:#f5a623">← Back to Home</a>
        </body>
        </html>
        """
        self.wfile.write(html.encode())
    def log_message(self, format, *args):
        print(f"[ORDERS] {args[0]} {args[1]}")

if __name__ == "__main__":
    print("Orders service running on port 5002...")
    HTTPServer(("0.0.0.0", 5002), Handler).serve_forever()
