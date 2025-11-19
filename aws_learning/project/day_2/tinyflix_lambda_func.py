import json
import urllib.parse # to decode URL-encoded S3 object keys
import boto3 # AWS SDK for Python

# Create a reusable S3 client outside the handler for connection reuse between Lambda invocations
s3 = boto3.client('s3')

def lambda_handler(event, context):
    """
    AWS Lambda entry point.
    This function expects an S3 event (object-created) and returns the object's Content-Type.
    """
    
    # Extract bucket name and object key from the first record in the event.
    bucket = event['Records'][0]['s3']['bucket']['name']

    # The key may be URL-encoded (spaces, special chars). unquote_plus decodes '+' to spaces as well.
    key = urllib.parse.unquote_plus(
        event['Records'][0]['s3']['object']['key'],
        encoding='utf-8'
    )
    
    try:
        # Retrieve the object metadata and body from S3
        response = s3.get_object(Bucket=bucket, Key=key)
        
        # response is a dict containing metadata and the object's body stream.
        # 'ContentType' is a common metadata field indicating the MIME type.
        print("CONTENT TYPE: " + response['ContentType'])
        
        # Return the content type (useful for tests or other integrations)
        return response['ContentType']
        
    except Exception as e:
        # Log the error and the object identifiers to help debugging in CloudWatch logs
        print(e)
        print(f"Error processing object {key} from bucket {bucket}.")
        # Re-raise so Lambda records the invocation as a failure (and retries if configured)
        raise e
