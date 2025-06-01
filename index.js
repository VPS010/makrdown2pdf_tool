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
const { google } = require('googleapis');
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
            message: 'PDF stored locally due to Google Drive authentication issue. Please visit /auth/google to set up Google Drive authentication.'
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

// Route to get OAuth2 authorization URL
app.get('/auth/google', (req, res) => {
  try {
    const authUrl = getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle OAuth2 callback
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).send('Authorization code is required');
    }
    
    const oauth2Client = getOAuth2Client();
    
    // Exchange the authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Extract refresh token
    const refreshToken = tokens.refresh_token;
    
    if (!refreshToken) {
      return res.status(400).send('No refresh token was received. Please try again and make sure to approve access.');
    }
    
    res.send(`
      <h1>Authorization Successful</h1>
      <p>Your refresh token has been generated. Add this to your .env file:</p>
      <pre>GOOGLE_REFRESH_TOKEN=${refreshToken}</pre>
      <p><strong>Important:</strong> Keep this token secure and do not share it!</p>
    `);
  } catch (error) {
    console.error('Error in OAuth callback:', error.message);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Route to check Google Drive authentication status
app.get('/auth/status', async (req, res) => {
  try {
    // Check if we have a refresh token
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    
    if (refreshToken) {
      try {
        // Try to use the oauth client with refresh token
        const oauth2Client = getOAuth2Client();
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        
        // Make a simple API call to verify the token works
        await drive.about.get({ fields: 'user' });
        
        return res.status(200).json({
          valid: true,
          message: 'Google Drive refresh token is valid'
        });
      } catch (error) {
        console.error('Error validating refresh token:', error.message);
        return res.status(200).json({
          valid: false,
          message: 'Google Drive refresh token is invalid',
          error: error.message,
          authUrl: getAuthUrl()
        });
      }
    } else {
      return res.status(200).json({
        valid: false,
        message: 'No Google Drive refresh token found',
        authUrl: getAuthUrl()
      });
    }
  } catch (error) {
    return res.status(500).json({
      error: 'Error checking authentication status',
      details: error.message
    });
  }
});

// Root route - handles both health check and OAuth callback
app.get('/', (req, res) => {
  // Check if this is an OAuth callback (has code parameter)
  const code = req.query.code;
  
  if (code) {
    // This is an OAuth callback
    const oauth2Client = getOAuth2Client();
    
    // Exchange the authorization code for tokens
    oauth2Client.getToken(code)
      .then(({tokens}) => {
        // Extract refresh token
        const refreshToken = tokens.refresh_token;
        
        if (!refreshToken) {
          return res.status(400).send(`
            <h1>No Refresh Token Received</h1>
            <p>This can happen if you've previously authorized this application.</p>
            <p>Try revoking access in your Google Account and trying again.</p>
          `);
        }
        
        res.send(`
          <h1>Authorization Successful!</h1>
          <p>Your refresh token has been generated. Add this to your .env file:</p>
          <pre>GOOGLE_REFRESH_TOKEN=${refreshToken}</pre>
          <p><strong>Important:</strong> Keep this token secure and do not share it!</p>
        `);
      })
      .catch(error => {
        console.error('Error in OAuth callback:', error.message);
        res.status(500).send(`Error: ${error.message}`);
      });
  } else {
    // Regular health check
    res.status(200).json({ status: 'server is up' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Function to set up OAuth2 client with credentials from client_secret.json
function getOAuth2Client() {
  try {
    // Check for credentials in multiple locations
    let credentialsPath;
    let credentialsContent;
    
    // First check deployment environment secrets path
    if (fs.existsSync('/etc/secrets/client_secret.json')) {
      credentialsPath = '/etc/secrets/client_secret.json';
      console.log('Using client secret from /etc/secrets/client_secret.json');
    } 
    // Then check for a generic client_secret.json in the app root
    else if (fs.existsSync(path.join(__dirname, 'client_secret.json'))) {
      credentialsPath = path.join(__dirname, 'client_secret.json');
      console.log('Using client secret from client_secret.json');
    }
    // Finally use the specific client secret file
    else {
      credentialsPath = path.join(__dirname, 'client_secret_961589008930-dnhdi9g1ltasmqiev8uf32vfrckalfa1.apps.googleusercontent.com.json');
      console.log('Using client secret from specific client_secret file');
    }
    
    // Read and parse the credentials
    credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    
    // Set up OAuth2 client
    const { client_id, client_secret, redirect_uris } = credentials.installed;
    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );
    
    // Get refresh token from environment or secrets
    let refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    
    // If not in process.env, check deployment secrets location
    if (!refreshToken && fs.existsSync('/etc/secrets/.env')) {
      try {
        const envContent = fs.readFileSync('/etc/secrets/.env', 'utf8');
        const refreshTokenMatch = envContent.match(/GOOGLE_REFRESH_TOKEN=(.+)/);
        if (refreshTokenMatch && refreshTokenMatch[1]) {
          refreshToken = refreshTokenMatch[1].trim();
          console.log('Using refresh token from /etc/secrets/.env');
        }
      } catch (err) {
        console.error('Error reading from /etc/secrets/.env:', err.message);
      }
    }
    
    // Set up refresh token if available
    if (refreshToken) {
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      console.log('OAuth2 client configured with refresh token');
    } else {
      console.log('Refresh token not found in environment variables or secrets');
    }
    
    return oauth2Client;
  } catch (error) {
    console.error('Error setting up OAuth2 client:', error.message);
    throw new Error(`Failed to initialize OAuth2 client: ${error.message}`);
  }
}

// Function to check if refresh token is available
function hasRefreshToken() {
  return !!process.env.GOOGLE_REFRESH_TOKEN;
}

// Function to generate auth URL for obtaining refresh token
function getAuthUrl() {
  try {
    const oauth2Client = getOAuth2Client();
    
    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ];
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'  // Forces to get refresh token every time
    });
    
    return authUrl;
  } catch (error) {
    console.error('Error generating auth URL:', error.message);
    throw error;
  }
}

// Function to upload the PDF to Google Drive
async function uploadToGoogleDrive(pdfBuffer, title) {
  try {
    console.log('Starting Google Drive upload process...');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    // Generate a filename with timestamp to avoid duplicates
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    console.log(`Creating file: ${fileName}`);
    
    // Check if refresh token is available
    if (!hasRefreshToken()) {
      throw new Error('Google Drive refresh token not found in environment variables. Please visit /auth/google to set up authentication.');
    }
    
    // Get the OAuth2 client with refresh token
    const oauth2Client = getOAuth2Client();
    
    // Create Drive client using OAuth2 client
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Create file metadata
    const fileMetadata = {
      name: fileName,
      mimeType: 'application/pdf'
    };
    
    // If a folder ID is provided, add it to the metadata
    if (folderId) {
      fileMetadata.parents = [folderId];
      console.log(`Using folder ID: ${folderId}`);
    } else {
      console.log('No folder ID provided, uploading to root');
    }
    
    // Create media metadata
    const media = {
      mimeType: 'application/pdf',
      body: Readable.from(pdfBuffer)
    };
    
    console.log('Uploading file to Google Drive...');
    
    // Upload the file
    const uploadResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });
    
    const fileId = uploadResponse.data.id;
    console.log(`File uploaded successfully. File ID: ${fileId}`);
    
    // Set permissions to make the file publicly accessible
    try {
      console.log(`Setting public permissions for file ID: ${fileId}`);
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
      console.log('Permissions updated successfully');
    } catch (permissionError) {
      console.error('Error setting permissions:', permissionError.message);
      // Continue anyway, we might still be able to get a download link
    }
    
    try {
      console.log(`Retrieving download link for file ID: ${fileId}`);
      // Get file metadata including webContentLink and webViewLink
      const fileResponse = await drive.files.get({
        fileId: fileId,
        fields: 'webViewLink,webContentLink,id,name'
      });
      
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
      
      // As a fallback, construct a direct download link
      const fallbackLink = `https://drive.google.com/uc?export=download&id=${fileId}`;
      console.log('Using fallback download link:', fallbackLink);
      return fallbackLink;
    }
  } catch (error) {
    console.error('Error uploading to Google Drive:', error.message);
    throw error;
  }
}
