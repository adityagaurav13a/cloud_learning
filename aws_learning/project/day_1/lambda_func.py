import json # import the JSON utility package
import math # import the Python math library

import boto3 # import the AWS SDK (for Python the package name is boto3)
from time import gmtime, strftime # import two packages to help us with dates and date formatting


dynamodb = boto3.resource('dynamodb') # create a DynamoDB object using the AWS SDK
table = dynamodb.Table('SimpleMathApplication') # use the DynamoDB object to select our table
now = strftime("%a, %d %b %Y %H:%M:%S +0000", gmtime()) # store the current time in a human readable format in a variable

# define the handler function that the Lambda service will use an entry point
def lambda_handler(event, context):

    # extract the two numbers from the Lambda service's event object
    mathResult = math.pow(int(event['base']), int(event['exponent']))

# write result and time to the DynamoDB table using the object we instantiated and save response in a variable
    response = table.put_item(
        Item={
            'ID': str(mathResult),
            'LatestGreetingTime':now
            })

# return a properly formatted JSON object
    return {
    'statusCode': 200,
    'body': json.dumps('Your result is ' + str(mathResult))
    }