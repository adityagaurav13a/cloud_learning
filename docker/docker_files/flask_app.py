from flask import Flask, request, jsonify
import math
import statistics
from datetime import datetime

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "version": "1.0"
    })

@app.route('/calculate', methods=['POST'])
def calculator():
    data = request.json
    operation = data.get('operation')
    numbers = data.get('numbers', [])
    
    if not numbers or len(numbers) < 2:
        return jsonify({"error": "Need at least 2 numbers"}), 400
    
    try:
        if operation == 'add':
            result = sum(numbers)
        elif operation == 'multiply':
            result = math.prod(numbers)
        elif operation == 'power':
            result = numbers[0] ** numbers[1]
        elif operation == 'stats':
            return jsonify({
                "mean": statistics.mean(numbers),
                "median": statistics.median(numbers),
                "std_dev": statistics.stdev(numbers) if len(numbers) > 1 else 0
            })
        else:
            return jsonify({"error": "Invalid operation"}), 400
            
        return jsonify({
            "result": result,
            "numbers": numbers,
            "operation": operation,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/pi/<int:digits>', methods=['GET'])
def pi_digits(digits):
    if digits > 1000:
        return jsonify({"error": "Max 1000 digits"}), 400
    pi_str = str(math.pi)[:digits+2]
    return jsonify({"pi": pi_str, "digits": digits})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)

