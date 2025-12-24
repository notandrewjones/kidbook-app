// api/lulu/generate-print-pdf.js
// Server-side PDF generation for Lulu print fulfillment
// Uses PDFKit with embedded fonts for print-quality output

const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const path = require("path");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Page dimensions in points (1 inch = 72 points)
// Interior page dimensions (trim size)
const PAGE_DIMENSIONS = {
  'square-small': { width: 504, height: 504, inches: '7×7' },
  'square-medium': { width: 612, height: 612, inches: '8.5×8.5' },
  'square-large': { width: 720, height: 720, inches: '10×10' },
  'landscape-medium': { width: 792, height: 612, inches: '11×8.5' },
  'portrait-medium': { width: 612, height: 792, inches: '8.5×11' },
};

// Lulu casewrap hardcover cover specifications
const COVER_WRAP = 54;      // 0.75 inches in points
const COVER_BLEED = 9;      // 0.125 inches in points
const BLEED = 9;            // 0.125 inches in points

/**
 * Get the path to the Open Sans font file
 */
function getFontPath(weight = 'regular') {
  // @fontsource/open-sans stores fonts in node_modules
  const fontMap = {
    'regular': 'open-sans-latin-400-normal.ttf',
    'bold': 'open-sans-latin-700-normal.ttf',
  };
  
  const fontFile = fontMap[weight] || fontMap['regular'];
  
  // Try different possible locations
  const possiblePaths = [
    path.join(process.cwd(), 'node_modules', '@fontsource', 'open-sans', 'files', fontFile),
    path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'open-sans', 'files', fontFile),
    path.join('/var/task', 'node_modules', '@fontsource', 'open-sans', 'files', fontFile),
  ];
  
  for (const fontPath of possiblePaths) {
    try {
      require('fs').accessSync(fontPath);
      return fontPath;
    } catch (e) {
      // Try next path
    }
  }
  
  console.warn(`[PDF] Font file not found, using default. Tried: ${possiblePaths.join(', ')}`);
  return null;
}

/**
 * Fetch image as buffer
 */
async function fetchImageAsBuffer(url) {
  if (!url) return null;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(`Failed to fetch image ${url}:`, err.message);
    return null;
  }
}

/**
 * Convert PDF document to buffer
 */
function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * Register fonts with the PDF document
 */
function registerFonts(doc) {
  const regularFont = getFontPath('regular');
  const boldFont = getFontPath('bold');
  
  if (regularFont) {
    doc.registerFont('OpenSans', regularFont);
    console.log('[PDF] Registered OpenSans regular font');
  }
  
  if (boldFont) {
    doc.registerFont('OpenSans-Bold', boldFont);
    console.log('[PDF] Registered OpenSans bold font');
  }
  
  return {
    regular: regularFont ? 'OpenSans' : 'Helvetica',
    bold: boldFont ? 'OpenSans-Bold' : 'Helvetica-Bold',
  };
}

/**
 * Generate print-ready interior PDF for a book
 */
async function generateInteriorPdf(bookId, options = {}) {
  const { sizeCode = 'square-medium' } = options;
  
  console.log(`[PDF] Generating interior PDF for book ${bookId}`);
  
  // Get book data
  const { data: book, error: bookError } = await supabase
    .from("book_projects")
    .select(`
      id,
      selected_idea,
      story_json,
      illustrations,
      kid_name
    `)
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  const pages = book.story_json || [];
  const illustrations = book.illustrations || [];
  const title = book.selected_idea?.title || 'My Book';
  const author = book.kid_name || 'Author';

  if (pages.length === 0) {
    throw new Error('Book has no pages');
  }

  console.log(`[PDF] Book has ${pages.length} pages, ${illustrations.length} illustrations`);

  // Build page data with images
  const pageData = pages.map((page) => {
    const illustration = illustrations.find(i => i.page === page.page);
    return {
      page: page.page,
      text: page.text,
      imageUrl: illustration?.url || null,
    };
  });

  // Get dimensions
  const dimensions = PAGE_DIMENSIONS[sizeCode];
  if (!dimensions) {
    throw new Error(`Invalid size code: ${sizeCode}`);
  }

  const { width, height } = dimensions;
  const pageWidth = width + (BLEED * 2);
  const pageHeight = height + (BLEED * 2);

  // Create PDF
  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: title,
      Author: author,
      Subject: "Children's Picture Book",
      Creator: 'BrightStories',
    },
    autoFirstPage: false,
  });

  // Register fonts
  const fonts = registerFonts(doc);

  // Title page
  doc.addPage({ size: [pageWidth, pageHeight] });
  
  // Purple background
  doc.rect(0, 0, pageWidth, pageHeight).fill('#667eea');
  
  // Title
  doc.font(fonts.bold)
     .fillColor('white')
     .fontSize(36)
     .text(title, 0, pageHeight / 2 - 50, {
       width: pageWidth,
       align: 'center',
     });
  
  // Author
  doc.font(fonts.regular)
     .fontSize(18)
     .text(`by ${author}`, 0, pageHeight / 2 + 10, {
       width: pageWidth,
       align: 'center',
     });

  // Content pages
  for (let i = 0; i < pageData.length; i++) {
    const page = pageData[i];
    
    doc.addPage({ size: [pageWidth, pageHeight] });
    
    // White background
    doc.rect(0, 0, pageWidth, pageHeight).fill('white');

    // Add image if available
    if (page.imageUrl) {
      try {
        console.log(`[PDF] Fetching image for page ${page.page}...`);
        const imageBuffer = await fetchImageAsBuffer(page.imageUrl);
        if (imageBuffer) {
          const imgX = BLEED + 20;
          const imgY = BLEED + 20;
          const imgWidth = width - 40;
          const imgHeight = height * 0.55;
          
          doc.image(imageBuffer, imgX, imgY, {
            width: imgWidth,
            height: imgHeight,
            fit: [imgWidth, imgHeight],
            align: 'center',
            valign: 'center',
          });
        }
      } catch (imgErr) {
        console.error(`[PDF] Failed to add image for page ${page.page}:`, imgErr.message);
      }
    }

    // Add text
    if (page.text) {
      const textX = BLEED + 30;
      const textY = BLEED + height * 0.62;
      const textWidth = width - 60;
      
      doc.font(fonts.regular)
         .fillColor('#333333')
         .fontSize(14)
         .text(page.text, textX, textY, {
           width: textWidth,
           align: 'left',
           lineGap: 4,
         });
    }

    // Page number
    doc.font(fonts.regular)
       .fillColor('#999999')
       .fontSize(10)
       .text(String(page.page), 0, pageHeight - BLEED - 20, {
         width: pageWidth,
         align: 'center',
       });
  }

  // Calculate current page count (title page + content pages)
  let currentPageCount = pageData.length + 1;
  
  // Lulu requires minimum 24 pages for hardcover casewrap
  const MIN_PAGES = 24;
  
  // Add blank pages if needed to meet minimum
  if (currentPageCount < MIN_PAGES) {
    const blankPagesToAdd = MIN_PAGES - currentPageCount;
    console.log(`[PDF] Adding ${blankPagesToAdd} blank pages to meet minimum of ${MIN_PAGES}`);
    
    for (let i = 0; i < blankPagesToAdd; i++) {
      doc.addPage({ size: [pageWidth, pageHeight] });
      doc.rect(0, 0, pageWidth, pageHeight).fill('white');
    }
    
    currentPageCount = MIN_PAGES;
  }

  // Get PDF as buffer
  const pdfBuffer = await pdfToBuffer(doc);
  
  console.log(`[PDF] Interior PDF generated: ${pdfBuffer.length} bytes, ${currentPageCount} pages`);

  return {
    buffer: pdfBuffer,
    pageCount: currentPageCount,
    dimensions,
  };
}

/**
 * Generate print-ready cover PDF for a book
 */
async function generateCoverPdf(bookId, options = {}) {
  const { 
    sizeCode = 'square-medium',
    pageCount = 24,
  } = options;

  console.log(`[PDF] Generating cover PDF for book ${bookId}`);

  // Get book data
  const { data: book, error: bookError } = await supabase
    .from("book_projects")
    .select(`
      id,
      selected_idea,
      illustrations,
      kid_name
    `)
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  const title = book.selected_idea?.title || 'My Book';
  const author = book.kid_name || 'Author';
  const illustrations = book.illustrations || [];
  
  // Use first illustration as cover image
  const coverIllustration = illustrations.find(i => i.page === 1);
  const coverImageUrl = coverIllustration?.url || null;

  const dimensions = PAGE_DIMENSIONS[sizeCode];
  if (!dimensions) {
    throw new Error(`Invalid size code: ${sizeCode}`);
  }

  const { width, height } = dimensions;
  
  // Calculate spine width
  const spineInches = Math.max(0.25, pageCount * 0.0025);
  const spineWidth = Math.round(spineInches * 72);
  
  console.log(`[PDF] Cover calculation for ${sizeCode}: ${pageCount} pages, spine=${spineInches.toFixed(3)}" (${spineWidth}pt)`);

  // Total cover dimensions
  const coverWidth = (COVER_BLEED * 2) + (COVER_WRAP * 2) + (width * 2) + spineWidth;
  const coverHeight = (COVER_BLEED * 2) + (COVER_WRAP * 2) + height;
  
  console.log(`[PDF] Cover dimensions: ${(coverWidth/72).toFixed(3)}" x ${(coverHeight/72).toFixed(3)}"`);

  // Create PDF
  const doc = new PDFDocument({
    size: [coverWidth, coverHeight],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
  });

  // Register fonts
  const fonts = registerFonts(doc);

  // Full purple background
  doc.rect(0, 0, coverWidth, coverHeight).fill('#667eea');

  // Calculate positions
  const contentStartX = COVER_BLEED + COVER_WRAP;
  const contentStartY = COVER_BLEED + COVER_WRAP;

  // Spine
  const spineX = contentStartX + width;
  doc.rect(spineX, 0, spineWidth, coverHeight).fill('#764ba2');

  // Back cover text
  doc.font(fonts.regular)
     .fillColor('white')
     .fontSize(12)
     .text('A wonderful story created with love.', 
           contentStartX + 20, 
           contentStartY + height / 2 - 6, 
           { width: width - 40, align: 'center' });

  // Front cover
  const frontX = contentStartX + width + spineWidth;
  const frontCenterX = frontX + width / 2;

  // Cover image
  if (coverImageUrl) {
    try {
      console.log(`[PDF] Fetching cover image...`);
      const imageBuffer = await fetchImageAsBuffer(coverImageUrl);
      if (imageBuffer) {
        const imgSize = Math.min(width * 0.6, height * 0.5);
        const imgX = frontCenterX - imgSize / 2;
        const imgY = contentStartY + 30;
        
        doc.image(imageBuffer, imgX, imgY, {
          width: imgSize,
          height: imgSize,
          fit: [imgSize, imgSize],
          align: 'center',
          valign: 'center',
        });
      }
    } catch (imgErr) {
      console.error(`[PDF] Failed to add cover image:`, imgErr.message);
    }
  }

  // Title
  doc.font(fonts.bold)
     .fillColor('white')
     .fontSize(32)
     .text(title, frontX + 20, contentStartY + height * 0.65, {
       width: width - 40,
       align: 'center',
     });

  // Author
  doc.font(fonts.regular)
     .fontSize(16)
     .text(`by ${author}`, frontX + 20, contentStartY + height * 0.65 + 45, {
       width: width - 40,
       align: 'center',
     });

  // Get PDF as buffer
  const pdfBuffer = await pdfToBuffer(doc);

  console.log(`[PDF] Cover PDF generated: ${pdfBuffer.length} bytes`);

  return {
    buffer: pdfBuffer,
    dimensions: {
      width: coverWidth,
      height: coverHeight,
      spineWidth,
    },
  };
}

module.exports = {
  generateInteriorPdf,
  generateCoverPdf,
  PAGE_DIMENSIONS,
  BLEED,
  COVER_WRAP,
  COVER_BLEED,
};