// Enhanced PDF Generator with Professional Templates
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const MarkdownIt = require('markdown-it');
const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');
const { Readable } = require('stream');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Configure AWS S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text({ type: 'text/markdown' }));

// Professional PDF Template Class
class ProfessionalPDFTemplate {
  constructor() {
    // Colors sampled from the provided image (approximate)
    this.colors = {
      bg: '#81cdde', // Lighter blue background (closer to reference)
      white: '#FFFFFF',
      dark: '#232f34', // Slightly softer dark
      blue: '#0197bf', // Main blue
      yellow: '#ffc107', // Lighter yellow (closer to reference)
      black: '#222222',
      gray: '#4a6c7a', // Footer text
      link: '#165cb2', // Footer link
      darkblue: '#015f94', // Extra: dark blue for border
      teal: '#0195bc', // Extra: teal for border
      orange: '#ffc401', // Extra: orange for border
    };
    this.fonts = {
      regular: 'Helvetica',
      bold: 'Helvetica-Bold',
      italic: 'Helvetica-Oblique',
      boldItalic: 'Helvetica-BoldOblique'
    };
  }

  createCoverPage(doc, data) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Background color (light blue)
    doc.fill(this.colors.bg)
      .rect(0, 0, pageWidth, pageHeight)
      .fill();

    // White circle background
    const circleRadius = 270;
    const centerX = pageWidth / 2;
    // Move the circle higher (closer to top)
    const centerY = pageHeight * 0.364;
    doc.fill(this.colors.white)
      .circle(centerX, centerY, circleRadius)
      .fill();

    // Logo image (centered in white circle)
    const logoPath = path.join(__dirname, 'MatCare_Werkt_loopbaan-2-150x180.png');
    // The logo in the template is centered horizontally, and slightly above the text, inside the white circle.
    // The logo image is about 75px wide and 90px tall in the template (approximate, scale as needed)
    const logoWidth = 98;
    const logoHeight = 117;
    const logoX = centerX - logoWidth / 2;
    const logoY = centerY - 120 - logoHeight / 2 - 20; // -10 moves it further up
    try {
      doc.image(logoPath, logoX, logoY, { width: logoWidth, height: logoHeight });
    } catch (e) {
      // fallback: draw a circle if image fails
      doc.fill(this.colors.blue)
        .circle(centerX, centerY - 120, 38)
        .fill();
      doc.fill(this.colors.white)
        .circle(centerX, centerY - 120, 27)
        .fill();
    }



    // Main title (larger, higher, bold blue)
    doc.fillColor(this.colors.blue)
      .font(this.fonts.bold)
      .fontSize(32);

    // Calculate width and center the text properly
    const titleText = 'Persoonlijk rapport';
    const titleWidth = doc.widthOfString(titleText);
    const titleX = centerX - titleWidth / 2;

    doc.text(titleText, titleX, centerY - 40, {
      width: 500
    });

    // Subtitle (larger, bold, blue, closer to title) - FIXED CENTERING WITH WRAPPING
    const subtitleText = (data.clientName && data.profession)
      ? `${data.clientName} (${data.profession})`
      : '(NAAM) (functie)';

    doc.font(this.fonts.bold)
      .fontSize(34)
      .fillColor(this.colors.blue);

    // Set maximum width for subtitle (should fit within the white circle)
    const maxSubtitleWidth = circleRadius * 1.6; // 80% of circle diameter for safe margins
    const subtitleWidth = Math.min(doc.widthOfString(subtitleText), maxSubtitleWidth);
    const subtitleX = centerX - subtitleWidth / 2;

    doc.text(subtitleText, subtitleX, centerY + 90, {
      width: subtitleWidth,
      align: 'center'
    });



    // Footer information (positioned in lower left, after horizontal mid-point)
    const footerY = pageHeight - 200; // Position higher up
    const footerX = pageWidth * 0.54; // Start after horizontal mid-point (60% from left)

    const footerWidth = 200; // Reduced width for left alignment

    // Company name (bold, darker color)
    doc.fillColor(this.colors.darkblue)
      .font(this.fonts.bold)
      .fontSize(12)
      .text('MatchcareWerkt', footerX, footerY, { align: 'left', width: footerWidth });

    // Address lines (regular font, darker color, propegaps)
    doc.font(this.fonts.regular)
      .fillColor(this.colors.darkblue)
      .fontSize(12)
      .text('Daltonlaan 200 unit 8.3', footerX, footerY + 22, { align: 'left', width: footerWidth })
      .text('3584 BJ Utrecht', footerX, footerY + 37, { align: 'left', width: footerWidth });


    // Email link (blue color with underline)
    doc.fillColor(this.colors.link)
       .font(this.fonts.regular)
       .fontSize(12)
       .text('Contact@matchcarewerkt.nl', footerX, footerY + 97, {align: 'left', width: footerWidth, link: 'mailto:contact@matchcarewerkt.nl', underline: true});

    // Website (darker color)
    doc.fillColor(this.colors.darkblue)
      .fontSize(12)
      .text('www.matchcarewerkt.nl', footerX, footerY + 112, { align: 'left', width: footerWidth });



    // Bottom border with four vertical color divisions (thin)
    const borderHeight = 5;
    const borderY = pageHeight - borderHeight;
    const sectionW = pageWidth / 4;
    doc.fill(this.colors.darkblue)
      .rect(0, borderY, sectionW, borderHeight)
      .fill();
    doc.fill(this.colors.teal)
      .rect(sectionW, borderY, sectionW, borderHeight)
      .fill();
    doc.fill(this.colors.bg)
      .rect(sectionW * 2, borderY, sectionW, borderHeight)
      .fill();
    doc.fill(this.colors.orange)
      .rect(sectionW * 3, borderY, sectionW, borderHeight)
      .fill();
  }

  createContentPage(doc, content, pageNumber) {
    doc.addPage();
    
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    
    // Top border with four vertical color divisions (thin)
    const borderHeight = 5;
    const borderY = 0;
    const sectionW = pageWidth / 4;
    doc.fill(this.colors.darkblue)
      .rect(0, borderY, sectionW, borderHeight)
      .fill();
    doc.fill(this.colors.teal)
      .rect(sectionW, borderY, sectionW, borderHeight)
      .fill();
    doc.fill(this.colors.bg)
      .rect(sectionW * 2, borderY, sectionW, borderHeight)
      .fill();
    doc.fill(this.colors.orange)
      .rect(sectionW * 3, borderY, sectionW, borderHeight)
      .fill();

    // Page number with graphic element (matching template design)
    const pageNumY = pageHeight - 30; // Position from bottom
    const pageNumX = pageWidth - 50; // Position from right
    
    // Draw circular background for page number (matching template)
    const circleRadius = 12;
    // Draw quarter-arc (bottom-right) instead of full circle
    doc.lineWidth(4)
       .strokeColor(this.colors.blue)
       .lineCap('round')
       .arc(pageNumX, pageNumY, circleRadius, 315, 45, false)
       .stroke();
    
    // Page number text (dark on white background)
    doc.fill(this.colors.dark)
      .font(this.fonts.bold)
      .fontSize(12);
    
    const pageNumText = pageNumber.toString();
    const textWidth = doc.widthOfString(pageNumText);
    const textX = pageNumX - textWidth / 2;
    const textY = pageNumY - 6; // Adjust for vertical centering
    
    doc.text(pageNumText, textX, textY);

    // Content area - start after top border with proper margin
    this.addContent(doc, content, 50, 25, pageWidth - 100); // Start closer to top border
  }

  /**
   * Enhanced markdown renderer for content pages.
   * Supports:
   *  - Headings (#, ##, ###)
   *  - Unordered lists (-, *) with nesting via leading spaces (2 per level)
   *  - Ordered lists (1. 2. etc) with nesting via leading spaces
   *  - Blockquotes (> )
   *  - Horizontal rules (---)
   *  - Inline **bold**, *italic*, and [link](url)
   */
  addContent(doc, content, x, y, width) {
    const lines = content.split('\n');
    let currentY = y;
    let pageHeight = doc.page.height;
    const bottomMargin = 60; // footer space

    const pendingTable = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const raw = lines[idx];
      const line = raw.replace(/\r$/, '');

      // Collect table lines
      if (/^\|.*\|\s*$/.test(line)) {
        pendingTable.push(line);
        // If next line is still part of table, continue collecting
        if (idx < lines.length - 1) continue;
      }

      // If exiting a table block, render it now
      if (pendingTable.length && !/^\|.*\|\s*$/.test(line)) {
        currentY = this._renderTable(doc, pendingTable, x, currentY, width) + 6;
        pendingTable.length = 0; // reset
      }

      // Page break if needed
      if (currentY > pageHeight - bottomMargin) {
        this._addNewPageDecoration(doc);
        currentY = y;
        pageHeight = doc.page.height;
      }

      // Horizontal rule
      if (/^---+\s*(?:\*\(.+\)\*)?\s*$/.test(line.trim())) {
        doc.moveTo(x, currentY + 4)
           .lineTo(x + width, currentY + 4)
           .strokeColor(this.colors.gray)
           .lineWidth(1)
           .stroke();
        currentY += 12;
        continue;
      }

      // Blank line
      if (!line.trim()) {
        currentY += 10;
        continue;
      }

      // Headings (#, ##, ###)
      if (line.startsWith('# ')) {
        doc.fill(this.colors.dark)
           .font(this.fonts.bold)
           .fontSize(24)
           .text(line.slice(2), x, currentY, { width, align: 'left' });
        currentY = doc.y + 12;
        continue;
      }
      if (line.startsWith('## ')) {
        doc.fill(this.colors.blue)
           .font(this.fonts.bold)
           .fontSize(18)
           .text(line.slice(3), x, currentY, { width, align: 'left' });
        currentY = doc.y + 10;
        continue;
      }
      if (line.startsWith('### ')) {
        doc.fill(this.colors.dark)
           .font(this.fonts.bold)
           .fontSize(14)
           .text(line.slice(4), x, currentY, { width, align: 'left' });
        currentY = doc.y + 8;
        continue;
      }

      // Blockquote with grey left bar (supports list items too)
      if (line.startsWith('>')) {
        const depth = line.match(/^>+/)[0].length;
        const inner = line.slice(depth).trim();
        const barX = x + (depth - 1) * 6; // indent per depth
        // Draw vertical bar
        doc.strokeColor(this.colors.gray).lineWidth(1).moveTo(barX + 2, currentY).lineTo(barX + 2, currentY + 14).stroke();

        // Detect list item inside blockquote
        // Only treat leading - or * as list marker if it is the first non-space char
        const listMatch = inner.match(/^([-*])\s+(.*)$/);
        if (listMatch) {
          const bullet = '•';
          const itemText = listMatch[2];

          // Render bullet
          doc.fill(this.colors.gray)
             .font(this.fonts.italic)
             .fontSize(11)
             .text(bullet, barX + 12, currentY);

          // Render text with inline formatting support
          currentY = this.addFormattedText(doc, itemText, barX + 24, currentY, width - (barX - x) - 24, this.colors.gray) + 4;
        } else {
          // Plain quote line
          doc.fill(this.colors.gray)
             .font(this.fonts.italic)
             .fontSize(11)
           currentY = this.addFormattedText(doc, inner, barX + 10, currentY, width - (barX - x) - 10, this.colors.gray) + 4;
        }
        continue;
      }

      // Lists (ordered & unordered)
      const match = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (match) {
        const indentSpaces = match[1].length;
        const marker = match[2];
        const itemText = match[3];
        const indentX = x + indentSpaces * 4;
        const bullet = /^\d/.test(marker) ? marker.replace(/\.$/, '') + '.' : '•';
        // Draw bullet / number marker separately for proper alignment
        doc.font(this.fonts.regular)
           .fontSize(11)
           .fill(this.colors.dark)
           .text(bullet, indentX, currentY, {continued: false});

        const textStartX = indentX + 12; // space after bullet
        const availWidth = width - (textStartX - x);
        currentY = this.addFormattedText(doc, itemText, textStartX, currentY, availWidth) + 4;
        continue;
      }

      // Development Opportunities label (custom)
      if (line.startsWith('#### Development Opportunities:')) {
        doc.fill(this.colors.blue)
           .font(this.fonts.bold)
           .fontSize(12)
           .text('Development Opportunities:', x, currentY, { width, align: 'left' });
        currentY = doc.y + 6;
        continue;
      }

      // Regular paragraph
      currentY = this.addFormattedText(doc, line, x, currentY, width) + 4;
    }
  }

  // Draw header/footer decorations for a new content page created within addContent
  _addNewPageDecoration(doc) {
    doc.addPage();
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    const sectionW = pageWidth / 4;
    const borderHeight = 5;
    // top border
    doc.fill(this.colors.darkblue).rect(0, 0, sectionW, borderHeight).fill();
    doc.fill(this.colors.teal).rect(sectionW, 0, sectionW, borderHeight).fill();
    doc.fill(this.colors.bg).rect(sectionW * 2, 0, sectionW, borderHeight).fill();
    doc.fill(this.colors.orange).rect(sectionW * 3, 0, sectionW, borderHeight).fill();

    // page number circle
    // Logical page number excludes cover page (first page)
    const pageNum = doc.bufferedPageRange().count - 1;
    const pageNumX = pageWidth - 50;
    const pageNumY = pageHeight - 30;
    // Quarter-arc graphic around page number
    doc.lineWidth(4)
       .strokeColor(this.colors.blue)
       .lineCap('round')
       .arc(pageNumX, pageNumY, 12, 315, 45, false)
       .stroke();
    doc.fill(this.colors.dark).font(this.fonts.bold).fontSize(12);
    const w = doc.widthOfString(String(pageNum));
    doc.text(String(pageNum), pageNumX - w / 2, pageNumY - 6);
  }
  /**
   * Enhanced markdown renderer for content pages.
   * Supports:
   *  - Headings (#, ##, ###)
   *  - Unordered lists (-, *) with nesting via leading spaces (2 per level)
   *  - Ordered lists (1. 2. etc) with nesting via leading spaces
   *  - Blockquotes (> )
   *  - Horizontal rules (---)
   *  - Inline **bold**, *italic*, and [link](url)
   */
  addFormattedText(doc, text, x, y, width, color = this.colors.dark) {
    // Parse inline **bold** / *italic* markers
    const parts = this.parseTextFormatting(text);
    // Ensure regular paragraph color & size
    doc.fill(color).fontSize(11);

    let cursorX = x;

    parts.forEach((part, idx) => {
      // Select font style
      if (part.bold && part.italic && this.fonts.boldItalic) {
        doc.font(this.fonts.boldItalic);
      } else if (part.bold) {
        doc.font(this.fonts.bold);
      } else if (part.italic) {
        doc.font(this.fonts.italic);
      } else {
        doc.font(this.fonts.regular);
      }

      const textOptions = {
        continued: idx < parts.length - 1,
        link: part.link || undefined,
        underline: Boolean(part.link)
      };

      // Only provide width & align options on first fragment to avoid progressive width shrink
      if (idx === 0) {
        Object.assign(textOptions, { width, align: 'left' });
        doc.text(part.text, cursorX, y, textOptions);
      } else {
        doc.text(part.text, textOptions);
      }

      cursorX += doc.widthOfString(part.text);
    });

    // Close any continued text chains
    doc.text('', { continued: false });

    // Return updated Y position after rendering
    return doc.y;
  }

  /**
   * Parse inline markdown for **bold**, *italic*, ***bold-italic*** and [link](url).
   * Returns an array of fragments: { text, bold?, italic?, link? }
   */
  parseTextFormatting(text) {
    const fragments = [];

    // First, split out links so that asterisks/underscores inside URLs don't confuse the regex.
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let m;
    while ((m = linkRegex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        fragments.push(...this.parseBasicFormatting(text.slice(lastIndex, m.index)));
      }
      fragments.push({ text: m[1], link: m[2] });
      lastIndex = linkRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      fragments.push(...this.parseBasicFormatting(text.slice(lastIndex)));
    }
    return fragments;
  }

  /**
   * Helper: parse **bold**, *italic*, __bold__, _italic_, ***both***, ___both___ inside a chunk with no links.
   */
  parseBasicFormatting(chunk) {
    const fragments = [];
    // Regex captures the longest formatting tokens first (*** / ___), then ** / __, then * / _, then plain text.
    const regex = /(\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|[^*_]+)/g;
    let match;
    while ((match = regex.exec(chunk)) !== null) {
      const part = match[1];
      if ((/^\*\*\*/.test(part) && /\*\*\*$/.test(part)) || (/^___/.test(part) && /___$/.test(part))) {
        fragments.push({ text: part.slice(3, -3), bold: true, italic: true });
      } else if ((/^\*\*/.test(part) && /\*\*$/.test(part)) || (/^__/.test(part) && /__$/.test(part))) {
        fragments.push({ text: part.slice(2, -2), bold: true });
      } else if ((/^\*/.test(part) && /\*$/.test(part)) || (/^_/.test(part) && /_$/.test(part))) {
        fragments.push({ text: part.slice(1, -1), italic: true });
      } else {
        fragments.push({ text: part });
      }
    }
    return fragments;
  }

  /**
   * Render a markdown table from an array of raw table lines.
   */
  _renderTable(doc, rawLines, x, y, width) {
    if (!rawLines.length) return y;

    // Parse rows and remove outer pipes
    const rows = rawLines.map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));

    // Detect alignment row (--- etc.) and strip
    const alignRegex = /^:?-+:?$/;
    let header = rows[0];
    let dataRows = rows.slice(1);
    if (dataRows.length && dataRows[0].every(c => alignRegex.test(c))) {
      dataRows = dataRows.slice(1);
    }

    // If pdfkit-table (plugin) is available, use it for full-featured grids
    if (typeof doc.table === 'function') {
      const tableData = { headers: header, rows: dataRows };
      const opts = {
        x,
        y,
        width,
        columnSpacing: 5,
        padding: 4,
        prepareHeader: () => {
          doc.font(this.fonts.bold).fill(this.colors.dark);
        },
        prepareRow: () => {
          doc.font(this.fonts.regular).fill(this.colors.dark);
        },
        border: null // let plugin draw default borders
      };
      doc.table(tableData, opts);
      return doc.y + 4;
    }

    // Manual grid renderer when pdfkit-table is unavailable
    // Follows style from markdown2pdf_tool.ts: fixed row height and full grid borders
    // Simple column metrics
    const colCount = header.length;
    const pageWidth = width;
    const colWidth = pageWidth / colCount;
    const rowHeight = 22;
    let currentY = y + 2;

    const bottomMargin = 60;

    const renderRow = (cells, isHeader = false) => {
      // Measure required height for this row based on cell content
      const textHeights = cells.map(cell => doc.heightOfString(cell.trim(), { width: colWidth - 10, align: 'left' }));
      const rowH = Math.max(...textHeights, 12) + 10; // add vertical padding

      // Page break if needed
      if (currentY + rowH > doc.page.height - bottomMargin) {
        this._addNewPageDecoration(doc);
        currentY = doc.y + 10;
      }

      // Header background
      if (isHeader) {
        doc.save();
        doc.rect(x, currentY, pageWidth, rowH)
           .fillColor('#f6f8fa')
           .fill();
        doc.restore();
      }

      cells.forEach((cell, colIdx) => {
        const cellX = x + colIdx * colWidth;

        // Cell border
        doc.save();
        doc.rect(cellX, currentY, colWidth, rowH)
           .strokeColor('#e1e4e8')
           .lineWidth(0.5)
           .stroke();
        doc.restore();

        // Cell content
        doc.font(isHeader ? this.fonts.bold : this.fonts.regular)
           .fontSize(isHeader ? 11 : 10)
           .fill(this.colors.dark)
           .text(cell.trim(), cellX + 5, currentY + 5, { width: colWidth - 10, ellipsis: true });
      });

      currentY += rowH;
    };

    renderRow(header, true);
    dataRows.forEach(r => renderRow(r, false));

    return currentY + 4;
  }
}

// Enhanced convert endpoint
app.post('/convert', async (req, res) => {
  try {
    let markdownContent;
    let reportData = {};

    // Handle different content types
    if (req.is('application/json')) {
      if (req.body.markdown) {
        markdownContent = req.body.markdown;
        reportData = req.body.reportData || {};
      } else {
        return res.status(400).json({
          error: 'Invalid JSON format. Please provide markdown content and optional reportData'
        });
      }
    } else if (req.is('text/markdown')) {
      markdownContent = req.body;
    } else {
      markdownContent = req.body;
    }

    if (!markdownContent) {
      return res.status(400).json({ error: 'Markdown content is required' });
    }

    // Generate professional PDF
    const pdfBuffer = await new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 0,
          size: 'A4',
          bufferPages: true
        });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', err => reject(err));

        const template = new ProfessionalPDFTemplate();

        // Extract title from markdown or use provided data
        const lines = markdownContent.split('\n');
        if (!reportData.title && lines[0] && lines[0].startsWith('# ')) {
          reportData.title = lines[0].substring(2);
        }

        // Create cover page
        template.createCoverPage(doc, reportData);

        // Create content pages starting with page number 1
        template.createContentPage(doc, markdownContent, 1);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });

    // Upload to S3 and return URL
    const fileName = `professional-report-${uuidv4()}.pdf`;

    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }));

      const bucketRegion = process.env.AWS_REGION || 'us-east-1';
      const publicUrl = `https://${BUCKET_NAME}.s3.${bucketRegion}.amazonaws.com/${fileName}`;

      res.status(200).json({
        success: true,
        message: 'Professional PDF generated and uploaded successfully',
        downloadUrl: publicUrl,
        permanent: true
      });
    } catch (uploadError) {
      console.error('Error uploading to S3:', uploadError);
      return res.status(500).json({ error: 'Failed to upload PDF to S3' });
    }

  } catch (error) {
    console.error('Error in /convert route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Template preview endpoint
app.get('/template-preview', (req, res) => {
  res.json({
    message: 'Professional PDF Template',
    features: [
      'Custom cover page with branding',
      'Professional color scheme',
      'Structured content layout',
      'Page headers and footers',
      'Typography hierarchy',
      'Automatic page breaks'
    ],
    usage: {
      endpoint: '/convert',
      method: 'POST',
      body: {
        markdown: 'Your markdown content here',
        reportData: {
          title: 'Custom Report Title',
          subtitle: 'Custom Subtitle',
          clientName: 'Client Name',
          profession: 'Profession'
        }
      }
    }
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'Professional PDF Generator is running',
    endpoints: ['/convert', '/template-preview']
  });
});

app.listen(PORT, () => {
  console.log(`Professional PDF Generator running on port ${PORT}`);
});