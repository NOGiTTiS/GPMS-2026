# Stage 1: Build
FROM golang:1.25.5-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o main .

# Stage 2: Production Run
FROM alpine:latest

WORKDIR /app

# Timezone setting (Thailand)
RUN apk add --no-cache tzdata
ENV TZ=Asia/Bangkok

# Copy binary from builder
COPY --from=builder /app/main .

# Create uploads folder
RUN mkdir -p uploads

EXPOSE 8080

CMD ["./main"]
