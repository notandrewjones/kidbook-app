// js/compositor/exporter.js
// Export engine for generating PDFs from composed book pages

import { PageRenderer, PAGE_DIMENSIONS } from './renderer.js';
import { getTemplate } from './templates.js';

/**
 * BookExporter - Handles exporting composed books to various formats
 * 
 * Primary format: PDF
 * Future formats: ePub, image sequence, print-ready PDF
 * 
 * Architecture designed for extensibility - each format is a separate method
 */

export class BookExporter {
  constructor() {
    this.renderer = new PageRenderer();
    this.jsPDFLoaded = false;
  }

  /**
   * Export book to PDF
   * @param {Object} bookData - { pages: [{page, text, imageUrl}], title, author }
   * @param {string|Object} template - Template ID or template object
   * @param {Object} options - Export options
   * @returns {Promise<Blob>} - PDF blob
   */
  async exportToPDF(bookData, template, options = {}) {
    await this.ensureJsPDFLoaded();

    const {
      pageSize = 'square-medium',
      quality = 'standard', // 'draft', 'standard', 'high', 'print'
      includeMetadata = true,
      includeCover = false,
    } = options;

    const dimensions = PAGE_DIMENSIONS[pageSize];
    const { width, height } = dimensions;

    // Quality settings
    const qualitySettings = {
      draft: { scale: 1, imageQuality: 0.6 },
      standard: { scale: 1.5, imageQuality: 0.8 },
      high: { scale: 2, imageQuality: 0.92 },
      print: { scale: 3, imageQuality: 1.0 },
    };
    const { scale, imageQuality } = qualitySettings[quality] || qualitySettings.standard;

    // Create PDF document
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [width, height],
      compress: true,
    });

    // Add metadata
    if (includeMetadata) {
      pdf.setProperties({
        title: bookData.title || 'My Book',
        author: bookData.author || 'Created with Book Compositor',
        subject: 'Children\'s Picture Book',
        keywords: 'children, book, illustrated',
        creator: 'Book Compositor',
      });
    }

    // Render each page
    const tmpl = typeof template === 'string' ? getTemplate(template) : template;
    
    // Preload fonts
    await this.renderer.preloadFonts([tmpl.typography?.fontFamily || 'Georgia']);

    for (let i = 0; i < bookData.pages.length; i++) {
      const pageData = bookData.pages[i];
      
      // Add new page for all except first
      if (i > 0) {
        pdf.addPage([width, height]);
      }

      // Render page to SVG
      const svg = this.renderer.render(pageData, tmpl, options.overrides || {});
      
      // Convert SVG to image and add to PDF
      await this.addSvgToPdf(pdf, svg, width, height, scale, imageQuality);

      // Progress callback
      if (options.onProgress) {
        options.onProgress({
          current: i + 1,
          total: bookData.pages.length,
          percent: Math.round(((i + 1) / bookData.pages.length) * 100),
        });
      }
    }

    // Return as blob
    return pdf.output('blob');
  }

  /**
   * Convert SVG to image and add to PDF page
   */
  async addSvgToPdf(pdf, svg, width, height, scale, imageQuality) {
    return new Promise((resolve, reject) => {
      // Serialize SVG
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      
      // Create blob URL
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create image from SVG
      const img = new Image();
      img.onload = () => {
        // Create canvas at scaled resolution
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        
        // Draw white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // Draw SVG
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', imageQuality);
        
        // Add to PDF
        pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height);
        
        // Cleanup
        URL.revokeObjectURL(url);
        resolve();
      };
      
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image'));
      };

      img.src = url;
    });
  }

  /**
   * Export book as image sequence
   * @returns {Promise<Blob[]>} - Array of PNG blobs
   */
  async exportToImages(bookData, template, options = {}) {
    const {
      pageSize = 'square-medium',
      format = 'png',
      scale = 2,
    } = options;

    const dimensions = PAGE_DIMENSIONS[pageSize];
    const { width, height } = dimensions;
    const tmpl = typeof template === 'string' ? getTemplate(template) : template;

    await this.renderer.preloadFonts([tmpl.typography?.fontFamily || 'Georgia']);

    const images = [];

    for (let i = 0; i < bookData.pages.length; i++) {
      const pageData = bookData.pages[i];
      const svg = this.renderer.render(pageData, tmpl, options.overrides || {});
      
      const blob = await this.svgToImageBlob(svg, width, height, scale, format);
      images.push({
        page: pageData.page,
        blob,
        filename: `page-${String(pageData.page).padStart(3, '0')}.${format}`,
      });

      if (options.onProgress) {
        options.onProgress({
          current: i + 1,
          total: bookData.pages.length,
          percent: Math.round(((i + 1) / bookData.pages.length) * 100),
        });
      }
    }

    return images;
  }

  /**
   * Convert SVG to image blob
   */
  async svgToImageBlob(svg, width, height, scale, format) {
    return new Promise((resolve, reject) => {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          },
          format === 'png' ? 'image/png' : 'image/jpeg',
          0.92
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to convert SVG to image'));
      };

      img.src = url;
    });
  }

  /**
   * Download PDF
   */
  async downloadPDF(bookData, template, options = {}) {
    const blob = await this.exportToPDF(bookData, template, options);
    
    const filename = options.filename || 
      `${(bookData.title || 'my-book').toLowerCase().replace(/\s+/g, '-')}.pdf`;
    
    this.downloadBlob(blob, filename);
    return blob;
  }

  /**
   * Download all pages as ZIP
   */
  async downloadImagesZip(bookData, template, options = {}) {
    // This would require JSZip library
    // For now, download individually
    const images = await this.exportToImages(bookData, template, options);
    
    for (const img of images) {
      this.downloadBlob(img.blob, img.filename);
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 200));
    }
    
    return images;
  }

  /**
   * Download a blob as file
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Ensure jsPDF is loaded
   */
  async ensureJsPDFLoaded() {
    if (this.jsPDFLoaded && window.jspdf) return;

    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.jspdf) {
        this.jsPDFLoaded = true;
        resolve();
        return;
      }

      // Load jsPDF from CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => {
        this.jsPDFLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load jsPDF'));
      document.head.appendChild(script);
    });
  }

  /**
   * Get estimated file size
   */
  estimateFileSize(pageCount, quality = 'standard') {
    // Rough estimates based on page count and quality
    const baseSizePerPage = {
      draft: 100,      // ~100KB per page
      standard: 200,   // ~200KB per page
      high: 400,       // ~400KB per page
      print: 800,      // ~800KB per page
    };

    const perPage = baseSizePerPage[quality] || baseSizePerPage.standard;
    const totalKB = pageCount * perPage;
    
    if (totalKB < 1024) {
      return `~${totalKB} KB`;
    } else {
      return `~${(totalKB / 1024).toFixed(1)} MB`;
    }
  }
}

// Export formats registry (for future extensibility)
export const EXPORT_FORMATS = {
  pdf: {
    id: 'pdf',
    name: 'PDF Document',
    extension: 'pdf',
    mimeType: 'application/pdf',
    description: 'Best for printing and sharing',
    available: true,
  },
  png: {
    id: 'png',
    name: 'PNG Images',
    extension: 'png',
    mimeType: 'image/png',
    description: 'High quality images for each page',
    available: true,
  },
  jpg: {
    id: 'jpg',
    name: 'JPEG Images',
    extension: 'jpg',
    mimeType: 'image/jpeg',
    description: 'Smaller file size images',
    available: true,
  },
  epub: {
    id: 'epub',
    name: 'ePub E-book',
    extension: 'epub',
    mimeType: 'application/epub+zip',
    description: 'For e-readers and tablets',
    available: false, // Coming soon
  },
  printReady: {
    id: 'printReady',
    name: 'Print-Ready PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
    description: 'CMYK with bleed for professional printing',
    available: false, // Coming soon
  },
};

// Export singleton instance
export const bookExporter = new BookExporter();