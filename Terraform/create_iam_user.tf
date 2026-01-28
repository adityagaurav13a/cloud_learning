resource "aws_iam_user" "users" {
    name = "mary"
    tags = {
      description = "creating my first user"
    }
}
