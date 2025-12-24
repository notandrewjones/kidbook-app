// api/lulu/generate-print-pdf.js
// Server-side PDF generation for Lulu print fulfillment
// Uses Puppeteer to render book pages and generate print-ready PDFs

const { createClient } = require("@supabase/supabase-js");
const chromium = require("@sparticuz/chromium-min");
const puppeteer = require("puppeteer-core");

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
 * Generate print-ready interior PDF for a book
 */
async function generateInteriorPdf(bookId, options = {}) {
  const { sizeCode = 'square-medium' } = options;
  
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

  // Build page data with images
  const pageData = pages.map((page, index) => {
    const illustration = illustrations.find(i => i.page === page.page);
    return {
      page: page.page,
      text: page.text,
      imageUrl: illustration?.url || null,
    };
  });

  // Generate PDF
  const dimensions = PAGE_DIMENSIONS[sizeCode];
  if (!dimensions) {
    throw new Error(`Invalid size code: ${sizeCode}`);
  }

  const pdfBuffer = await renderBookToPdf(pageData, {
    title,
    author,
    width: dimensions.width,
    height: dimensions.height,
    addBleed: true,
  });

  return {
    buffer: pdfBuffer,
    pageCount: pageData.length,
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
    pageCount,
    spineWidth = null, // In points, or calculated from pageCount
  } = options;

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

  // Calculate spine width based on page count
  // Lulu formula: approximately 0.0025 inches per page for standard paper
  const calculatedSpineWidth = spineWidth || Math.max(18, Math.round((pageCount || 32) * 0.18));

  // Total cover width = back + spine + front + bleed on each side
  const coverWidth = (dimensions.width * 2) + calculatedSpineWidth + (BLEED * 2);
  const coverHeight = dimensions.height + (BLEED * 2);

  const pdfBuffer = await renderCoverToPdf({
    title,
    author,
    coverImageUrl,
    bookWidth: dimensions.width,
    bookHeight: dimensions.height,
    spineWidth: calculatedSpineWidth,
    totalWidth: coverWidth,
    totalHeight: coverHeight,
  });

  return {
    buffer: pdfBuffer,
    dimensions: {
      width: coverWidth,
      height: coverHeight,
      spineWidth: calculatedSpineWidth,
    },
  };
}

/**
 * Render book pages to PDF using Puppeteer
 */
async function renderBookToPdf(pages, options) {
  const { title, author, width, height, addBleed } = options;
  
  const pageWidth = addBleed ? width + (BLEED * 2) : width;
  const pageHeight = addBleed ? height + (BLEED * 2) : height;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Set viewport to page dimensions
    await page.setViewport({
      width: Math.round(pageWidth),
      height: Math.round(pageHeight),
      deviceScaleFactor: 2, // High quality
    });

    // Generate HTML for all pages
    const pagesHtml = pages.map((p, index) => generatePageHtml(p, {
      width: pageWidth,
      height: pageHeight,
      contentWidth: width,
      contentHeight: height,
      bleed: addBleed ? BLEED : 0,
      isFirst: index === 0,
      isLast: index === pages.length - 1,
    })).join('');

    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Bubblegum+Sans&family=Comic+Neue:wght@400;700&family=Fredoka+One&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${pageWidth}pt ${pageHeight}pt; margin: 0; }
    body { font-family: 'Comic Neue', 'Patrick Hand', sans-serif; }
    .page {
      width: ${pageWidth}pt;
      height: ${pageHeight}pt;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    .page:last-child { page-break-after: auto; }
    .content {
      position: absolute;
      top: ${addBleed ? BLEED : 0}pt;
      left: ${addBleed ? BLEED : 0}pt;
      width: ${width}pt;
      height: ${height}pt;
      display: flex;
      flex-direction: column;
    }
    .image-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20pt;
    }
    .image-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 12pt;
    }
    .text-container {
      padding: 20pt 30pt;
      text-align: center;
      background: linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0.8));
    }
    .text-container p {
      font-size: 18pt;
      line-height: 1.6;
      color: #333;
    }
    .page-number {
      position: absolute;
      bottom: ${(addBleed ? BLEED : 0) + 15}pt;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10pt;
      color: #999;
    }
    /* Title page styles */
    .title-page .content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .title-page h1 {
      font-family: 'Fredoka One', 'Bubblegum Sans', cursive;
      font-size: 42pt;
      color: white;
      text-align: center;
      text-shadow: 3pt 3pt 6pt rgba(0,0,0,0.3);
      margin-bottom: 20pt;
    }
    .title-page .author {
      font-size: 18pt;
      color: rgba(255,255,255,0.9);
    }
  </style>
</head>
<body>
  <!-- Title Page -->
  <div class="page title-page">
    <div class="content">
      <h1>${escapeHtml(title)}</h1>
      <p class="author">by ${escapeHtml(author)}</p>
    </div>
  </div>
  ${pagesHtml}
</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    // Wait for fonts and images to load
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      width: `${pageWidth}pt`,
      height: `${pageHeight}pt`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return pdfBuffer;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate HTML for a single page
 */
function generatePageHtml(pageData, options) {
  const { width, height, contentWidth, contentHeight, bleed, isFirst, isLast } = options;
  
  const imageHtml = pageData.imageUrl 
    ? `<div class="image-container"><img src="${pageData.imageUrl}" alt="Illustration" /></div>`
    : `<div class="image-container" style="background: #f0f0f0;"></div>`;

  const textHtml = pageData.text
    ? `<div class="text-container"><p>${escapeHtml(pageData.text)}</p></div>`
    : '';

  return `
    <div class="page">
      <div class="content">
        ${imageHtml}
        ${textHtml}
      </div>
      <span class="page-number">${pageData.page}</span>
    </div>
  `;
}

/**
 * Render cover to PDF
 */
async function renderCoverToPdf(options) {
  const { 
    title, author, coverImageUrl,
    bookWidth, bookHeight, spineWidth,
    totalWidth, totalHeight 
  } = options;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setViewport({
      width: Math.round(totalWidth),
      height: Math.round(totalHeight),
      deviceScaleFactor: 2,
    });

    const coverHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Patrick+Hand&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${totalWidth}pt;
      height: ${totalHeight}pt;
      display: flex;
      font-family: 'Patrick Hand', cursive;
    }
    .back-cover {
      width: ${bookWidth + BLEED}pt;
      height: ${totalHeight}pt;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: ${BLEED + 30}pt;
    }
    .back-cover p {
      font-size: 14pt;
      color: rgba(255,255,255,0.9);
      text-align: center;
      line-height: 1.6;
    }
    .spine {
      width: ${spineWidth}pt;
      height: ${totalHeight}pt;
      background: linear-gradient(180deg, #764ba2 0%, #667eea 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      writing-mode: vertical-rl;
      text-orientation: mixed;
    }
    .spine h2 {
      font-family: 'Fredoka One', cursive;
      font-size: ${Math.min(14, spineWidth * 0.6)}pt;
      color: white;
      text-shadow: 1pt 1pt 2pt rgba(0,0,0,0.3);
    }
    .front-cover {
      width: ${bookWidth + BLEED}pt;
      height: ${totalHeight}pt;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: ${BLEED + 20}pt;
      position: relative;
    }
    .front-cover .cover-image {
      width: ${bookWidth * 0.7}pt;
      height: ${bookHeight * 0.5}pt;
      border-radius: 16pt;
      object-fit: cover;
      box-shadow: 0 8pt 24pt rgba(0,0,0,0.3);
      margin-bottom: 30pt;
    }
    .front-cover h1 {
      font-family: 'Fredoka One', cursive;
      font-size: 36pt;
      color: white;
      text-align: center;
      text-shadow: 3pt 3pt 6pt rgba(0,0,0,0.3);
      margin-bottom: 15pt;
    }
    .front-cover .author {
      font-size: 16pt;
      color: rgba(255,255,255,0.9);
    }
  </style>
</head>
<body>
  <div class="back-cover">
    <p>A wonderful story created with love.</p>
  </div>
  <div class="spine">
    <h2>${escapeHtml(title)}</h2>
  </div>
  <div class="front-cover">
    ${coverImageUrl ? `<img class="cover-image" src="${coverImageUrl}" alt="Cover" />` : ''}
    <h1>${escapeHtml(title)}</h1>
    <p class="author">by ${escapeHtml(author)}</p>
  </div>
</body>
</html>`;

    await page.setContent(coverHtml, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);

    const pdfBuffer = await page.pdf({
      width: `${totalWidth}pt`,
      height: `${totalHeight}pt`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return pdfBuffer;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Launch Puppeteer browser
 * Uses chromium-min for Vercel serverless compatibility
 */
async function launchBrowser() {
  // In production (Vercel), use chromium-min
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(
        'https://github.com/nicholaswbowen/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
      ),
      headless: chromium.headless,
    });
  }
  
  // In development, use local Chrome
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  generateInteriorPdf,
  generateCoverPdf,
  PAGE_DIMENSIONS,
  BLEED,
};
