# TinyFlix Lambda

A small AWS Lambda that is triggered by S3 object events and returns the object's Content-Type.

Files
- [tinyflix_lambda_func.py](tinyflix_lambda_func.py) — contains the Lambda handler function [`lambda_handler`](tinyflix_lambda_func.py).

Requirements
- Python 3.8+
- boto3

Quick test (local)
1. Create a test event JSON (example below).
2. Run the handler from a Python REPL or script.

Example event (minimal):
```json
{
  "Records": [
    {
      "s3": {
        "bucket": { "name": "your-bucket" },
        "object": { "key": "path/to/object.txt" }
      }
    }
  ]
}



---

## Roadmap

We are continuously improving TinyFlix Lambda to make it more developer‑friendly and production‑ready.  
Upcoming enhancements include:

- **CLI Login Support**: Soon, you will be able to authenticate directly from the command line.  
  This will allow developers to run the Lambda handler locally with secure credentials, making testing and debugging much easier.  

- **Expanded Event Handling**: Support for additional S3 event types and richer logging.  

- **Mock Testing Utilities**: Local testing without AWS credentials using mocked S3 events.

Stay tuned for updates as we expand functionality and streamline the developer experience!