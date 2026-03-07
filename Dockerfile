# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /build

# Copy go mod and sum files
COPY Server/go.mod Server/go.sum ./
RUN go mod download

# Copy source code
COPY Server/ ./

# Build the binary
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o messenger .

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/messenger .

# Copy static files
COPY Client ./Client

# Create a volume for the database (optional)
VOLUME /app/data

# Expose port
EXPOSE 8080

# Set environment variables
ENV DB_PATH=/app/data/messenger.db
ENV STATIC_DIR=./Client
ENV PORT=8080

# Run the binary
CMD ["./messenger", "-db", "/app/data/messenger.db", "-static", "./Client", "-port", "8080"]