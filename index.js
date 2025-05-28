const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const MarkdownIt = require('markdown-it');
const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');
const { Readable } = require('stream');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Create a directory for local PDF storage as fallback
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Serve static files from the uploads directory
app.use('/downloads', express.static(UPLOAD_DIR));

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
      if (req.body && req.body.markdown) {
        markdownContent = String(req.body.markdown); // Ensure it's a string
      } else {
        return res.status(400).json({ 
          error: 'Invalid JSON format. Please provide markdown content as {"markdown": "Your markdown here"}' 
        });
      }
    } else if (req.is('text/markdown')) {
      // Raw markdown text
      markdownContent = String(req.body);
    } else if (typeof req.body === 'string') {
      markdownContent = req.body;
    } else if (req.body && typeof req.body === 'object') {
      // Try to extract markdown from unknown object
      markdownContent = req.body.markdown || req.body.content || req.body.text || JSON.stringify(req.body);
      markdownContent = String(markdownContent);
    } else {
      return res.status(400).json({ error: 'Unsupported content type or format' });
    }
    
    if (!markdownContent) {
      return res.status(400).json({ error: 'Markdown content is required' });
    }
    
    // Validate that markdownContent is a string
    if (typeof markdownContent !== 'string') {
      return res.status(400).json({ error: 'Markdown content must be a string' });
    }

    // We'll be returning JSON with the download link instead of the PDF itself
    
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
        // Extract the title from the markdown content first (outside the Promise)
        const lines = markdownContent.split('\n');
        let documentTitle = 'Converted Document';
        if (lines[0] && lines[0].startsWith('# ')) {
          documentTitle = lines[0].substring(2);
        }
        
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
            
            doc.fontSize(24);
            doc.font('Helvetica-Bold');
            doc.text(documentTitle, { align: 'center' });
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
        
        // Try to upload the PDF to Google Drive and get the download link
        try {
          const downloadUrl = await uploadToGoogleDrive(pdfBuffer, documentTitle);
          res.json({ 
            downloadUrl,
            source: 'google_drive'
          });
        } catch (uploadError) {
          console.log('Google Drive upload failed, using local storage fallback:', uploadError.message);
          
          // Fallback: Save the PDF locally and provide a local download link
          const localFileName = `${documentTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
          const localFilePath = path.join(UPLOAD_DIR, localFileName);
          
          // Write the PDF to the local filesystem
          fs.writeFileSync(localFilePath, pdfBuffer);
          
          // Create a local download URL
          const localDownloadUrl = `/downloads/${localFileName}`;
          
          res.json({
            downloadUrl: localDownloadUrl,
            source: 'local_storage',
            message: 'PDF stored locally due to Google Drive authentication issue. To use Google Drive, please update your access token.'
          });
        }
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

// Token verification endpoint
app.get('/verify-token', async (req, res) => {
  try {
    const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
    
    if (!accessToken) {
      return res.status(400).json({
        valid: false,
        message: 'No Google Drive access token found in environment variables',
        instructions: 'Add GOOGLE_ACCESS_TOKEN to your .env file'
      });
    }
    
    // Make a simple API call to check if the token is valid
    try {
      await axios.get('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      return res.status(200).json({
        valid: true,
        message: 'Google Drive access token is valid'
      });
    } catch (error) {
      // Token is invalid or expired
      return res.status(200).json({
        valid: false,
        message: 'Google Drive access token is invalid or expired',
        instructions: 'To get a new access token:\n' +
          '1. Go to https://developers.google.com/oauthplayground/\n' +
          '2. Select Drive API v3 under "Drive API v3"\n' +
          '3. Click "Authorize APIs" and follow the OAuth flow\n' +
          '4. Click "Exchange authorization code for tokens"\n' +
          '5. Copy the access token and update your .env file'
      });
    }
  } catch (error) {
    console.error('Error in token verification:', error);
    return res.status(500).json({
      valid: false,
      message: 'Error while verifying token',
      error: error.message
    });
  }
});

// Function to upload the PDF to Google Drive
async function uploadToGoogleDrive(pdfBuffer, title) {
  try {
    console.log('Starting Google Drive upload process...');
    const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!accessToken) {
      throw new Error('Google Drive access token not found in environment variables');
    }
    
    // Generate a filename with timestamp to avoid duplicates
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    console.log(`Creating file: ${fileName}`);
    
    // Create metadata for the file
    const metadata = {
      name: fileName,
      mimeType: 'application/pdf'
    };
    
    // If a folder ID is provided, add it to the metadata
    if (folderId) {
      metadata.parents = [folderId];
      console.log(`Using folder ID: ${folderId}`);
    } else {
      console.log('No folder ID provided, uploading to root');
    }
    
    // Use a simpler multipart upload approach
    console.log('Preparing file upload...');
    
    // Create a boundary for the multipart request
    const boundary = '-------314159265358979323846';
    
    // Create the multipart request body
    const metadataPart = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n'
    );
    
    const contentPart = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Type: application/pdf\r\n\r\n'
    );
    
    const closeDelimiter = Buffer.from('\r\n--' + boundary + '--', 'utf8');
    
    // Combine all parts
    const multipartRequestBody = Buffer.concat([
      metadataPart,
      contentPart,
      pdfBuffer,
      closeDelimiter
    ]);
    
    console.log('Uploading file to Google Drive...');
    
    // Upload file with multipart request
    const uploadResponse = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      multipartRequestBody,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': multipartRequestBody.length
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );
    
    const fileId = uploadResponse.data.id;
    console.log(`File uploaded successfully. File ID: ${fileId}`);
    
    try {
      console.log(`Setting public permissions for file ID: ${fileId}`);
      // Update permissions to make the file accessible with the link
      await axios.post(
        `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
        {
          role: 'reader',
          type: 'anyone'
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Permissions updated successfully');
    } catch (permissionError) {
      console.error('Error setting permissions:', permissionError.message);
      if (permissionError.response) {
        console.error('Permission response data:', permissionError.response.data);
      }
      // Continue anyway, we might still be able to get a download link
    }
    
    try {
      console.log(`Retrieving download link for file ID: ${fileId}`);
      // Get both webViewLink (for viewing in browser) and webContentLink (for direct download)
      const fileResponse = await axios.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink,webContentLink,id,name`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      
      console.log('File metadata retrieved:', fileResponse.data);
      
      // If webContentLink doesn't exist, create a direct download link
      let downloadLink = fileResponse.data.webContentLink;
      if (!downloadLink) {
        // Construct a direct download link if webContentLink is not available
        downloadLink = `https://drive.google.com/uc?export=download&id=${fileId}`;
        console.log('Generated direct download link:', downloadLink);
      }
      
      return downloadLink;
    } catch (linkError) {
      console.error('Error retrieving file links:', linkError.message);
      if (linkError.response) {
        console.error('Link retrieval response data:', linkError.response.data);
      }
      
      // As a fallback, construct a direct download link
      const fallbackLink = `https://drive.google.com/uc?export=download&id=${fileId}`;
      console.log('Using fallback download link:', fallbackLink);
      return fallbackLink;
    }
  } catch (error) {
    console.error('Error uploading to Google Drive:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      
      // Check for specific authentication errors
      if (error.response.status === 401) {
        // Don't throw here, just return the error to allow fallback
    return Promise.reject(new Error('Google Drive access token is expired or invalid. Please update your GOOGLE_ACCESS_TOKEN in the .env file.'));
      } else if (error.response.data && error.response.data.error) {
        throw new Error(`Google Drive API error: ${error.response.data.error.message || 'Unknown API error'}`);
      }
    }
    throw new Error('Failed to upload PDF to Google Drive');
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
