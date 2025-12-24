// api/lulu/generate-print-pdf.js
// Server-side PDF generation for Lulu print fulfillment
// Uses pdf-lib with custom embedded fonts for print-quality output

const { createClient } = require("@supabase/supabase-js");
const { PDFDocument, rgb } = require("pdf-lib");
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

const COVER_WRAP = 54;
const COVER_BLEED = 9;
const BLEED = 9;

// Font URLs from Google Fonts CDN (these are stable URLs)
const FONT_URLS = {
  regular: 'https://fonts.gstatic.com/s/opensans/v40/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C4nY1M2xLER.ttf',
  bold: 'https://fonts.gstatic.com/s/opensans/v40/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1y4nY1M2xLER.ttf',
};

// Cache for downloaded fonts
let fontCache = {};

/**
 * Download and cache font
 */
async function getFont(type = 'regular') {
  if (fontCache[type]) {
    return fontCache[type];
  }
  
  const url = FONT_URLS[type];
  if (!url) {
    throw new Error(`Unknown font type: ${type}`);
  }
  
  console.log(`[PDF] Downloading ${type} font...`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    fontCache[type] = new Uint8Array(arrayBuffer);
    
    console.log(`[PDF] Downloaded ${type} font: ${fontCache[type].length} bytes`);
    return fontCache[type];
  } catch (err) {
    console.error(`[PDF] Failed to download font:`, err.message);
    throw err;
  }
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
      kid_name,
      print_pages,
      print_cover_image
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
  
  // Check if we have pre-rendered pages from the compositor
  const printPages = book.print_pages || [];
  const usePreRenderedPages = printPages.length > 0;

  if (pages.length === 0 && printPages.length === 0) {
    throw new Error('Book has no pages');
  }

  console.log(`[PDF] Book has ${pages.length} pages, ${illustrations.length} illustrations`);
  console.log(`[PDF] Pre-rendered pages available: ${usePreRenderedPages ? printPages.length : 'No'}`);

  // Get dimensions
  const dimensions = PAGE_DIMENSIONS[sizeCode];
  if (!dimensions) {
    throw new Error(`Invalid size code: ${sizeCode}`);
  }

  const { width, height } = dimensions;
  const pageWidth = width + (BLEED * 2);
  const pageHeight = height + (BLEED * 2);

  // Create PDF and register fontkit for custom fonts
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  
  // Download and embed custom fonts
  const [regularFontBytes, boldFontBytes] = await Promise.all([
    getFont('regular'),
    getFont('bold'),
  ]);
  
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);
  
  console.log(`[PDF] Fonts embedded successfully`);
  
  // Set metadata
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(author);
  pdfDoc.setSubject("Children's Picture Book");
  pdfDoc.setCreator('BrightStories');

  if (usePreRenderedPages) {
    // Use pre-rendered pages from compositor
    console.log(`[PDF] Using ${printPages.length} pre-rendered pages`);
    
    for (let i = 0; i < printPages.length; i++) {
      const pageInfo = printPages[i];
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // White background
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(1, 1, 1),
      });

      // Fetch and embed the pre-rendered page image
      if (pageInfo.url) {
        try {
          console.log(`[PDF] Fetching pre-rendered page ${pageInfo.pageNumber}...`);
          const imageBytes = await fetchImageAsBuffer(pageInfo.url);
          if (imageBytes) {
            let image;
            try {
              image = await pdfDoc.embedPng(imageBytes);
            } catch {
              try {
                image = await pdfDoc.embedJpg(imageBytes);
              } catch (e) {
                console.error(`[PDF] Failed to embed pre-rendered page:`, e.message);
              }
            }
            
            if (image) {
              // Draw the pre-rendered page image filling the entire page (with bleed)
              const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
              const scaledWidth = image.width * scale;
              const scaledHeight = image.height * scale;
              
              page.drawImage(image, {
                x: (pageWidth - scaledWidth) / 2,
                y: (pageHeight - scaledHeight) / 2,
                width: scaledWidth,
                height: scaledHeight,
              });
            }
          }
        } catch (imgErr) {
          console.error(`[PDF] Pre-rendered page error:`, imgErr.message);
        }
      }
    }
  } else {
    // Fallback: Generate simple pages from data (original behavior)
    console.log(`[PDF] No pre-rendered pages, using fallback generation`);
    
    // Title page
    const titlePage = pdfDoc.addPage([pageWidth, pageHeight]);
    
    titlePage.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(0.4, 0.494, 0.918),
    });
    
    const titleWidth = boldFont.widthOfTextAtSize(title, 36);
    titlePage.drawText(title, {
      x: (pageWidth - titleWidth) / 2,
      y: pageHeight / 2 + 20,
      size: 36,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    
    const authorText = `by ${author}`;
    const authorWidth = regularFont.widthOfTextAtSize(authorText, 18);
    titlePage.drawText(authorText, {
      x: (pageWidth - authorWidth) / 2,
      y: pageHeight / 2 - 30,
      size: 18,
      font: regularFont,
      color: rgb(1, 1, 1),
    });

    // Build page data
    const pageData = pages.map((page) => {
      const illustration = illustrations.find(i => i.page === page.page);
      return {
        page: page.page,
        text: page.text,
        imageUrl: illustration?.url || null,
      };
    });

    // Content pages
    for (let i = 0; i < pageData.length; i++) {
      const pageInfo = pageData[i];
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(1, 1, 1),
      });

      // Add image
      if (pageInfo.imageUrl) {
        try {
          console.log(`[PDF] Fetching image for page ${pageInfo.page}...`);
          const imageBytes = await fetchImageAsBuffer(pageInfo.imageUrl);
          if (imageBytes) {
            let image;
            try {
              image = await pdfDoc.embedPng(imageBytes);
            } catch {
              try {
                image = await pdfDoc.embedJpg(imageBytes);
              } catch (e) {
                console.error(`[PDF] Failed to embed image:`, e.message);
              }
            }
            
            if (image) {
              const imgX = BLEED + 20;
              const imgY = pageHeight - BLEED - 20 - (height * 0.55);
              const imgWidth = width - 40;
              const imgHeight = height * 0.55;
              
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
          console.error(`[PDF] Image error:`, imgErr.message);
        }
      }

      // Add text
      if (pageInfo.text) {
        const textX = BLEED + 30;
        const textWidth = width - 60;
        const fontSize = 14;
        const lineHeight = fontSize * 1.4;
        
        const lines = wrapText(pageInfo.text, regularFont, fontSize, textWidth);
        let textY = BLEED + height * 0.35;
        
        for (const line of lines) {
          page.drawText(line, {
            x: textX,
            y: textY,
            size: fontSize,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          textY -= lineHeight;
        }
      }

      // Page number
      const pageNumText = String(pageInfo.page);
      const pageNumWidth = regularFont.widthOfTextAtSize(pageNumText, 10);
      page.drawText(pageNumText, {
        x: (pageWidth - pageNumWidth) / 2,
        y: BLEED + 15,
        size: 10,
        font: regularFont,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  // Add blank pages if needed
  let currentPageCount = pdfDoc.getPageCount();
  const MIN_PAGES = 24;
  
  if (currentPageCount < MIN_PAGES) {
    const blankPagesToAdd = MIN_PAGES - currentPageCount;
    console.log(`[PDF] Adding ${blankPagesToAdd} blank pages`);
    
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
 * Generate print-ready cover PDF
 */
async function generateCoverPdf(bookId, options = {}) {
  const { 
    sizeCode = 'square-medium',
    pageCount = 24,
  } = options;

  console.log(`[PDF] Generating cover PDF for book ${bookId}`);

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
  
  const spineInches = Math.max(0.25, pageCount * 0.0025);
  const spineWidth = Math.round(spineInches * 72);
  
  console.log(`[PDF] Cover: ${pageCount} pages, spine=${spineInches.toFixed(3)}"`);

  const coverWidth = (COVER_BLEED * 2) + (COVER_WRAP * 2) + (width * 2) + spineWidth;
  const coverHeight = (COVER_BLEED * 2) + (COVER_WRAP * 2) + height;
  
  console.log(`[PDF] Cover dimensions: ${(coverWidth/72).toFixed(3)}" x ${(coverHeight/72).toFixed(3)}"`);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  
  // Embed fonts
  const [regularFontBytes, boldFontBytes] = await Promise.all([
    getFont('regular'),
    getFont('bold'),
  ]);
  
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);
  
  const page = pdfDoc.addPage([coverWidth, coverHeight]);

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: coverWidth,
    height: coverHeight,
    color: rgb(0.4, 0.494, 0.918),
  });

  const contentStartX = COVER_BLEED + COVER_WRAP;
  const contentStartY = COVER_BLEED + COVER_WRAP;

  // Spine
  const spineX = contentStartX + width;
  page.drawRectangle({
    x: spineX,
    y: 0,
    width: spineWidth,
    height: coverHeight,
    color: rgb(0.463, 0.294, 0.635),
  });

  // Back cover text
  const backText = 'A wonderful story created with love.';
  const backTextWidth = regularFont.widthOfTextAtSize(backText, 12);
  page.drawText(backText, {
    x: contentStartX + (width - backTextWidth) / 2,
    y: contentStartY + height / 2,
    size: 12,
    font: regularFont,
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
            console.error(`[PDF] Cover image embed failed:`, e.message);
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
      console.error(`[PDF] Cover image error:`, imgErr.message);
    }
  }

  // Title
  const titleWidth = boldFont.widthOfTextAtSize(title, 32);
  page.drawText(title, {
    x: frontCenterX - titleWidth / 2,
    y: contentStartY + height * 0.25,
    size: 32,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  // Author
  const authorText = `by ${author}`;
  const authorWidth = regularFont.widthOfTextAtSize(authorText, 16);
  page.drawText(authorText, {
    x: frontCenterX - authorWidth / 2,
    y: contentStartY + height * 0.25 - 35,
    size: 16,
    font: regularFont,
    color: rgb(1, 1, 1),
  });

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