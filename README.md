# Markdown to PDF API

A simple Express.js backend service that converts Markdown content to PDF documents.

## Features

- RESTful API endpoint to convert Markdown to PDF
- Returns the generated PDF directly in the response
- Supports standard Markdown syntax

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## API Endpoints

### Convert Markdown to PDF

**Endpoint:** `POST /convert`

**Content-Type:** Either `application/json` or `text/markdown`

**Request Body:**
- If using `application/json`: JSON object with markdown content
- If using `text/markdown`: Raw markdown text

**Response:**
- Content-Type: `application/pdf`
- Body: PDF file binary data

**Example using curl:**

With JSON:
```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown": "# Hello World\n\nThis is a **Markdown** document."}' \
  --output converted.pdf
```

With raw Markdown:
```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: text/markdown" \
  -d '# Hello World\n\nThis is a **Markdown** document.' \
  --output converted.pdf
```

### Health Check

**Endpoint:** `GET /health`

**Response:**
- Status: 200 OK
- Body: `{"status": "ok"}`

## Dependencies

- express: Web server framework
- markdown-pdf: Converts Markdown to PDF
- body-parser: Request body parsing middleware
- cors: Cross-Origin Resource Sharing middleware
- morgan: HTTP request logger middleware

## License

ISC
