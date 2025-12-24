// api/lulu/generate-print-pdf.js
// Server-side PDF generation for Lulu print fulfillment
// Uses jsPDF for lightweight PDF generation (no Puppeteer/Chrome needed)

const { createClient } = require("@supabase/supabase-js");
const { jsPDF } = require("jspdf");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Page dimensions in points (1 inch = 72 points)
const PAGE_DIMENSIONS = {
  'square-small': { width: 504, height: 504, inches: '7×7' },
  'square-medium': { width: 612, height: 612, inches: '8.5×8.5' },
  'square-large': { width: 720, height: 720, inches: '10×10' },
  'landscape-medium': { width: 792, height: 612, inches: '11×8.5' },
  'portrait-medium': { width: 612, height: 792, inches: '8.5×11' },
};

// Lulu requires specific bleed margins (0.125 inch = 9 points)
const BLEED = 9;

/**
 * Fetch image as base64 data URL
 */
async function fetchImageAsBase64(url) {
  if (!url) return null;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // Determine mime type from URL or response
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`Failed to fetch image ${url}:`, err.message);
    return null;
  }
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
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [pageWidth, pageHeight],
  });

  // Set metadata
  pdf.setProperties({
    title: title,
    author: author,
    subject: "Children's Picture Book",
    creator: 'BrightStories',
  });

  // Add title page
  pdf.setFillColor(102, 126, 234); // Purple gradient start
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(36);
  pdf.text(title, pageWidth / 2, pageHeight / 2 - 30, { align: 'center' });
  
  pdf.setFontSize(18);
  pdf.text(`by ${author}`, pageWidth / 2, pageHeight / 2 + 20, { align: 'center' });

  // Add content pages
  for (let i = 0; i < pageData.length; i++) {
    const page = pageData[i];
    
    // Add new page
    pdf.addPage([pageWidth, pageHeight]);
    
    // White background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    // Add image if available
    if (page.imageUrl) {
      try {
        console.log(`[PDF] Fetching image for page ${page.page}...`);
        const imageData = await fetchImageAsBase64(page.imageUrl);
        if (imageData) {
          // Calculate image area (top 60% of page)
          const imgX = BLEED + 20;
          const imgY = BLEED + 20;
          const imgWidth = width - 40;
          const imgHeight = height * 0.55;
          
          pdf.addImage(imageData, 'JPEG', imgX, imgY, imgWidth, imgHeight);
        }
      } catch (imgErr) {
        console.error(`[PDF] Failed to add image for page ${page.page}:`, imgErr.message);
      }
    }

    // Add text
    if (page.text) {
      pdf.setTextColor(51, 51, 51);
      pdf.setFontSize(14);
      
      const textX = BLEED + 30;
      const textY = BLEED + height * 0.65;
      const textWidth = width - 60;
      
      // Word wrap text
      const lines = pdf.splitTextToSize(page.text, textWidth);
      pdf.text(lines, textX, textY);
    }

    // Add page number
    pdf.setTextColor(150, 150, 150);
    pdf.setFontSize(10);
    pdf.text(String(page.page), pageWidth / 2, pageHeight - BLEED - 15, { align: 'center' });
  }

  // Get PDF as buffer
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
  
  console.log(`[PDF] Interior PDF generated: ${pdfBuffer.length} bytes, ${pageData.length + 1} pages`);

  return {
    buffer: pdfBuffer,
    pageCount: pageData.length + 1, // +1 for title page
    dimensions,
  };
}

/**
 * Generate print-ready cover PDF for a book
 * Cover is a wraparound: back + spine + front
 */
async function generateCoverPdf(bookId, options = {}) {
  const { 
    sizeCode = 'square-medium',
    pageCount = 32,
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
  
  // Calculate spine width based on page count
  // Lulu formula: approximately 0.0025 inches per page for standard paper
  const spineWidth = Math.max(18, Math.round(pageCount * 0.18));

  // Total cover dimensions
  const coverWidth = (width * 2) + spineWidth + (BLEED * 2);
  const coverHeight = height + (BLEED * 2);

  // Create PDF
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [coverWidth, coverHeight],
  });

  // Background gradient (purple)
  pdf.setFillColor(102, 126, 234);
  pdf.rect(0, 0, coverWidth, coverHeight, 'F');

  // Back cover (left side)
  const backX = BLEED;
  const backWidth = width;
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.text('A wonderful story created with love.', backX + backWidth / 2, coverHeight / 2, { align: 'center' });

  // Spine (middle)
  const spineX = BLEED + width;
  pdf.setFillColor(118, 75, 162); // Slightly different purple
  pdf.rect(spineX, 0, spineWidth, coverHeight, 'F');
  
  // Spine text (rotated) - jsPDF doesn't easily support rotation, so we skip for now
  // In production, you'd use a more sophisticated approach

  // Front cover (right side)
  const frontX = BLEED + width + spineWidth;
  const frontCenterX = frontX + width / 2;

  // Add cover image if available
  if (coverImageUrl) {
    try {
      console.log(`[PDF] Fetching cover image...`);
      const imageData = await fetchImageAsBase64(coverImageUrl);
      if (imageData) {
        const imgSize = Math.min(width * 0.6, height * 0.4);
        const imgX = frontCenterX - imgSize / 2;
        const imgY = BLEED + 40;
        
        pdf.addImage(imageData, 'JPEG', imgX, imgY, imgSize, imgSize);
      }
    } catch (imgErr) {
      console.error(`[PDF] Failed to add cover image:`, imgErr.message);
    }
  }

  // Title
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(32);
  pdf.text(title, frontCenterX, coverHeight * 0.7, { align: 'center' });

  // Author
  pdf.setFontSize(16);
  pdf.text(`by ${author}`, frontCenterX, coverHeight * 0.7 + 35, { align: 'center' });

  // Get PDF as buffer
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

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
};