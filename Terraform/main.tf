resource "aws_iam_user" "users" {
    name = var.project-sapphire-users[count.index]
    count = length(var.project-sapphire-users)
}

resource "aws_s3_bucket" "finance_bucket" {
    bucket = "finance-data-bucket"
    tags = {
      description = "creating 1st bucket"
    }
}

resource "aws_s3_object" "finance-data-bucket-2025" {
    source = "/root/project-sapphire/data/finance-data-bucket-2025.csv"
    key = "finance-data-bucket-2025.csv"
    bucket = aws_s3_bucket.finance_bucket.id
}
