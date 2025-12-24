// api/lulu/generate-print-pdf.js
// Server-side PDF generation for Lulu print fulfillment
// Uses pdf-lib with embedded fonts for print-quality output

const { createClient } = require("@supabase/supabase-js");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

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

const COVER_WRAP = 54;      // 0.75 inches in points
const COVER_BLEED = 9;      // 0.125 inches in points
const BLEED = 9;            // 0.125 inches in points

/**
 * Fetch image as buffer
 */
async function fetchImageAsBuffer(url) {
  if (!url) return null;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    console.error(`Failed to fetch image ${url}:`, err.message);
    return null;
  }
}

/**
 * Simple text wrapping helper
 */
function wrapText(text, font, fontSize, maxWidth) {
  // Remove newlines and normalize whitespace
  const cleanText = text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  
  const words = cleanText.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if (!word) continue;
    
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
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
  const pdfDoc = await PDFDocument.create();
  
  // Embed standard fonts (these are truly embedded by pdf-lib)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Set metadata
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(author);
  pdfDoc.setSubject("Children's Picture Book");
  pdfDoc.setCreator('BrightStories');

  // Title page
  const titlePage = pdfDoc.addPage([pageWidth, pageHeight]);
  
  // Purple background
  titlePage.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: rgb(0.4, 0.494, 0.918), // #667eea
  });
  
  // Title
  const titleWidth = helveticaBold.widthOfTextAtSize(title, 36);
  titlePage.drawText(title, {
    x: (pageWidth - titleWidth) / 2,
    y: pageHeight / 2 + 20,
    size: 36,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  
  // Author
  const authorText = `by ${author}`;
  const authorWidth = helvetica.widthOfTextAtSize(authorText, 18);
  titlePage.drawText(authorText, {
    x: (pageWidth - authorWidth) / 2,
    y: pageHeight / 2 - 30,
    size: 18,
    font: helvetica,
    color: rgb(1, 1, 1),
  });

  // Content pages
  for (let i = 0; i < pageData.length; i++) {
    const pageInfo = pageData[i];
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // White background
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    });

    // Add image if available
    if (pageInfo.imageUrl) {
      try {
        console.log(`[PDF] Fetching image for page ${pageInfo.page}...`);
        const imageBytes = await fetchImageAsBuffer(pageInfo.imageUrl);
        if (imageBytes) {
          let image;
          // Try PNG first, then JPEG
          try {
            image = await pdfDoc.embedPng(imageBytes);
          } catch {
            try {
              image = await pdfDoc.embedJpg(imageBytes);
            } catch (e) {
              console.error(`[PDF] Failed to embed image for page ${pageInfo.page}:`, e.message);
            }
          }
          
          if (image) {
            const imgX = BLEED + 20;
            const imgY = pageHeight - BLEED - 20 - (height * 0.55);
            const imgWidth = width - 40;
            const imgHeight = height * 0.55;
            
            // Scale to fit
            const scale = Math.min(imgWidth / image.width, imgHeight / image.height);
            const scaledWidth = image.width * scale;
            const scaledHeight = image.height * scale;
            
            page.drawImage(image, {
              x: imgX + (imgWidth - scaledWidth) / 2,
              y: imgY + (imgHeight - scaledHeight) / 2,
              width: scaledWidth,
              height: scaledHeight,
            });
          }
        }
      } catch (imgErr) {
        console.error(`[PDF] Failed to add image for page ${pageInfo.page}:`, imgErr.message);
      }
    }

    // Add text
    if (pageInfo.text) {
      const textX = BLEED + 30;
      const textWidth = width - 60;
      const fontSize = 14;
      const lineHeight = fontSize * 1.4;
      
      const lines = wrapText(pageInfo.text, helvetica, fontSize, textWidth);
      let textY = BLEED + height * 0.35;
      
      for (const line of lines) {
        page.drawText(line, {
          x: textX,
          y: textY,
          size: fontSize,
          font: helvetica,
          color: rgb(0.2, 0.2, 0.2),
        });
        textY -= lineHeight;
      }
    }

    // Page number
    const pageNumText = String(pageInfo.page);
    const pageNumWidth = helvetica.widthOfTextAtSize(pageNumText, 10);
    page.drawText(pageNumText, {
      x: (pageWidth - pageNumWidth) / 2,
      y: BLEED + 15,
      size: 10,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  // Calculate current page count
  let currentPageCount = pageData.length + 1;
  
  // Lulu requires minimum 24 pages
  const MIN_PAGES = 24;
  
  if (currentPageCount < MIN_PAGES) {
    const blankPagesToAdd = MIN_PAGES - currentPageCount;
    console.log(`[PDF] Adding ${blankPagesToAdd} blank pages to meet minimum of ${MIN_PAGES}`);
    
    for (let i = 0; i < blankPagesToAdd; i++) {
      const blankPage = pdfDoc.addPage([pageWidth, pageHeight]);
      blankPage.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(1, 1, 1),
      });
    }
    
    currentPageCount = MIN_PAGES;
  }

  // Get PDF bytes
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  
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
  const pdfDoc = await PDFDocument.create();
  
  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const page = pdfDoc.addPage([coverWidth, coverHeight]);

  // Full purple background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: coverWidth,
    height: coverHeight,
    color: rgb(0.4, 0.494, 0.918), // #667eea
  });

  // Calculate positions
  const contentStartX = COVER_BLEED + COVER_WRAP;
  const contentStartY = COVER_BLEED + COVER_WRAP;

  // Spine - slightly different purple
  const spineX = contentStartX + width;
  page.drawRectangle({
    x: spineX,
    y: 0,
    width: spineWidth,
    height: coverHeight,
    color: rgb(0.463, 0.294, 0.635), // #764ba2
  });

  // Back cover text
  const backText = 'A wonderful story created with love.';
  const backTextWidth = helvetica.widthOfTextAtSize(backText, 12);
  page.drawText(backText, {
    x: contentStartX + (width - backTextWidth) / 2,
    y: contentStartY + height / 2,
    size: 12,
    font: helvetica,
    color: rgb(1, 1, 1),
  });

  // Front cover
  const frontX = contentStartX + width + spineWidth;
  const frontCenterX = frontX + width / 2;

  // Cover image
  if (coverImageUrl) {
    try {
      console.log(`[PDF] Fetching cover image...`);
      const imageBytes = await fetchImageAsBuffer(coverImageUrl);
      if (imageBytes) {
        let image;
        try {
          image = await pdfDoc.embedPng(imageBytes);
        } catch {
          try {
            image = await pdfDoc.embedJpg(imageBytes);
          } catch (e) {
            console.error(`[PDF] Failed to embed cover image:`, e.message);
          }
        }
        
        if (image) {
          const imgSize = Math.min(width * 0.6, height * 0.5);
          const scale = Math.min(imgSize / image.width, imgSize / image.height);
          const scaledWidth = image.width * scale;
          const scaledHeight = image.height * scale;
          
          page.drawImage(image, {
            x: frontCenterX - scaledWidth / 2,
            y: contentStartY + height - 30 - scaledHeight,
            width: scaledWidth,
            height: scaledHeight,
          });
        }
      }
    } catch (imgErr) {
      console.error(`[PDF] Failed to add cover image:`, imgErr.message);
    }
  }

  // Title
  const titleWidth = helveticaBold.widthOfTextAtSize(title, 32);
  page.drawText(title, {
    x: frontCenterX - titleWidth / 2,
    y: contentStartY + height * 0.25,
    size: 32,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  // Author
  const authorText = `by ${author}`;
  const authorWidth = helvetica.widthOfTextAtSize(authorText, 16);
  page.drawText(authorText, {
    x: frontCenterX - authorWidth / 2,
    y: contentStartY + height * 0.25 - 35,
    size: 16,
    font: helvetica,
    color: rgb(1, 1, 1),
  });

  // Get PDF bytes
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

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