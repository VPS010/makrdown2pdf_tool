const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');
const { Readable } = require('stream');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev')); // Logging
app.use(cors()); // Enable CORS
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.text({ type: 'text/markdown' })); // Parse Markdown as text

// Routes
app.post('/convert', (req, res) => {
  try {
    // Get markdown content from request body
    let markdownContent;
    
    // Handle different content types
    if (req.is('application/json')) {
      // Extract markdown from JSON object
      if (req.body.markdown) {
        markdownContent = req.body.markdown;
      } else {
        return res.status(400).json({ 
          error: 'Invalid JSON format. Please provide markdown content as {"markdown": "Your markdown here"}' 
        });
      }
    } else if (req.is('text/markdown')) {
      // Raw markdown text
      markdownContent = req.body;
    } else {
      markdownContent = req.body;
    }
    
    if (!markdownContent) {
      return res.status(400).json({ error: 'Markdown content is required' });
    }

    // Set response headers to send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
    
    // Convert markdown to HTML using markdown-it
    const md = new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true,
      typographer: true
    });
    
    const htmlContent = md.render(markdownContent);
    
    // Generate PDF from HTML using puppeteer
    (async () => {
      try {
        // Launch a headless browser
        const browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        // Create a new page
        const page = await browser.newPage();
        
        // Set content to our HTML
        await page.setContent(htmlContent, {
          waitUntil: 'networkidle0'
        });
        
        // Generate PDF
        const pdfBuffer = await page.pdf({
          format: 'A4',
          margin: {
            top: '50px',
            right: '50px',
            bottom: '50px',
            left: '50px'
          },
          printBackground: true
        });
        
        // Close the browser
        await browser.close();
        
        // Send the PDF buffer in the response
        res.send(pdfBuffer);
      } catch (err) {
        console.error('Error converting markdown to PDF:', err);
        return res.status(500).json({ error: 'Failed to convert markdown to PDF' });
      }
    })();
    
  } catch (error) {
    console.error('Error in /convert route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'server is up' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
