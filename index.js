const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const MarkdownIt = require('markdown-it');
const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');
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
    
    // Generate PDF using PDFKit
    (async () => {
      try {
        // Set up the PDF document
        const pdfBuffer = await new Promise((resolve, reject) => {
          try {
            // Create a PDF document
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];
            
            // Collect PDF data chunks
            doc.on('data', chunk => chunks.push(chunk));
            
            // Resolve promise with the complete PDF buffer
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            
            // Handle errors
            doc.on('error', err => reject(err));
            
            // Get only text content from markdown (removing HTML tags)
            const plainText = htmlContent.replace(/<[^>]*>/g, '');
            
            // Add a title - we'll use the first line as a title if it starts with #
            const lines = markdownContent.split('\n');
            let title = 'Converted Document';
            if (lines[0] && lines[0].startsWith('# ')) {
              title = lines[0].substring(2);
            }
            
            doc.fontSize(24);
            doc.font('Helvetica-Bold');
            doc.text(title, { align: 'center' });
            doc.moveDown(1);
            
            // Add the markdown content
            doc.fontSize(12);
            doc.font('Helvetica');
            
            // Format document based on markdown content
            const formattedContent = [];
            let inBold = false;
            let inItalic = false;
            let inHeading = false;
            
            lines.forEach((line, index) => {
              // Skip the first line if it's a title we've already handled
              if (index === 0 && line.startsWith('# ')) return;
              
              // Handle headings
              if (line.startsWith('## ')) {
                doc.moveDown(0.5);
                doc.fontSize(18).font('Helvetica-Bold').text(line.substring(3));
                doc.fontSize(12).font('Helvetica');
                doc.moveDown(0.5);
              } else if (line.startsWith('### ')) {
                doc.moveDown(0.5);
                doc.fontSize(16).font('Helvetica-Bold').text(line.substring(4));
                doc.fontSize(12).font('Helvetica');
                doc.moveDown(0.5);
              } else if (line.trim() === '') {
                doc.moveDown(0.5);
              } else {
                // Process the line for bold and italic markers
                let processedLine = line;
                
                // Replace bold markers
                processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, (match, content) => {
                  return content;
                });
                
                // Replace italic markers
                processedLine = processedLine.replace(/\*(.*?)\*/g, (match, content) => {
                  return content;
                });
                
                doc.text(processedLine);
              }
            });
            
            // Finalize the PDF
            doc.end();
          } catch (err) {
            reject(err);
          }
        });
        
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
