# creating a base image to compile Binary

FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . /app
RUN go mod init chat_server
#compiles the binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o chat_server .

# creating a distroless image with multistage build

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app/chat_server /chat_server
EXPOSE 8080
# Run as non-root user (distroless nonroot variant enforces this)
USER nonroot:nonroot
# Launch the server
ENTRYPOINT ["/chat_server"]
