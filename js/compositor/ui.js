// js/compositor/ui.js
// UI components for the book compositor - template picker, preview, customization

import { 
  getAllTemplates, 
  getTemplate, 
  getCategories, 
  FRAME_SHAPES, 
  FONT_FAMILIES, 
  COLOR_THEMES 
} from './templates.js';
import { PageRenderer, PAGE_DIMENSIONS } from './renderer.js';
import { bookExporter, EXPORT_FORMATS } from './exporter.js';

/**
 * CompositorUI - Manages the book composition interface
 * 
 * Features:
 * - Template gallery with live preview
 * - Real-time customization controls
 * - Page navigation
 * - Export options
 */

export class CompositorUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.renderer = new PageRenderer();
    
    // State
    this.bookData = null;
    this.selectedTemplate = 'classic-bottom';
    this.customizations = {};
    this.currentPageIndex = 0;
    this.isExporting = false;
    
    // Callbacks
    this.onExportComplete = null;
    this.onTemplateChange = null;
  }

  /**
   * Initialize the compositor with book data
   * @param {Object} bookData - { pages: [{page, text, imageUrl}], title, author }
   */
  initialize(bookData) {
    this.bookData = bookData;
    this.currentPageIndex = 0;
    this.render();
    this.preloadFonts();
  }

  /**
   * Update book data (e.g., after illustration generation)
   */
  updateBookData(bookData) {
    this.bookData = bookData;
    this.renderPreview();
  }

  /**
   * Render the full compositor UI
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="compositor">
        <!-- Header -->
        <div class="compositor-header">
          <div class="compositor-title">
            <h2>Book Layout</h2>
            <p>Choose a template and customize your book's appearance</p>
          </div>
          <div class="compositor-actions">
            <button id="export-btn" class="btn btn-primary">
              <span>Export PDF</span>
              <span class="btn-icon">↓</span>
            </button>
          </div>
        </div>

        <!-- Main content -->
        <div class="compositor-body">
          <!-- Sidebar: Template gallery & customization -->
          <aside class="compositor-sidebar">
            <!-- Template Categories -->
            <div class="sidebar-section">
              <div class="sidebar-section-title">Templates</div>
              <div id="template-categories" class="template-categories"></div>
              <div id="template-gallery" class="template-gallery"></div>
            </div>

            <!-- Customization Controls -->
            <div class="sidebar-section">
              <div class="sidebar-section-title">Customize</div>
              <div id="customization-controls" class="customization-controls"></div>
            </div>

            <!-- Export Options -->
            <div class="sidebar-section">
              <div class="sidebar-section-title">Export</div>
              <div id="export-options" class="export-options"></div>
            </div>
          </aside>

          <!-- Preview area -->
          <div class="compositor-preview-area">
            <div class="preview-controls">
              <button id="prev-page" class="icon-btn" title="Previous page">←</button>
              <span id="page-indicator" class="page-indicator">Page 1 of 1</span>
              <button id="next-page" class="icon-btn" title="Next page">→</button>
            </div>

            <div id="preview-container" class="preview-container">
              <div id="page-preview" class="page-preview"></div>
            </div>

            <div class="preview-thumbnails-wrapper">
              <div id="preview-thumbnails" class="preview-thumbnails"></div>
            </div>
          </div>
        </div>

        <!-- Export progress modal -->
        <div id="export-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-dialog modal-dialog-sm">
            <div class="modal-header">
              <div class="modal-title">Exporting Book</div>
            </div>
            <div class="modal-body">
              <div class="export-progress">
                <div id="export-progress-bar" class="progress-bar">
                  <div class="progress-fill" style="width: 0%"></div>
                </div>
                <div id="export-progress-text" class="progress-text">Preparing...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderTemplateGallery();
    this.renderCustomizationControls();
    this.renderExportOptions();
    this.renderPreview();
    this.renderThumbnails();
    this.bindEvents();
  }

  /**
   * Render template category tabs and gallery
   */
  renderTemplateGallery() {
    const categories = getCategories();
    const categoriesContainer = document.getElementById('template-categories');
    const galleryContainer = document.getElementById('template-gallery');

    // Category tabs
    categoriesContainer.innerHTML = categories.map(cat => `
      <button class="category-tab ${cat === 'classic' ? 'active' : ''}" data-category="${cat}">
        ${cat.charAt(0).toUpperCase() + cat.slice(1)}
      </button>
    `).join('');

    // Initial gallery (classic category)
    this.renderTemplatesByCategory('classic', galleryContainer);

    // Category tab events
    categoriesContainer.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        categoriesContainer.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderTemplatesByCategory(tab.dataset.category, galleryContainer);
      });
    });
  }

  /**
   * Render templates for a specific category
   */
  renderTemplatesByCategory(category, container) {
    const templates = getAllTemplates().filter(t => t.category === category);

    container.innerHTML = templates.map(tmpl => `
      <div class="template-card ${tmpl.id === this.selectedTemplate ? 'selected' : ''}" 
           data-template="${tmpl.id}">
        <div class="template-preview-mini" style="background: ${tmpl.colors.background}">
          <span class="template-icon">${tmpl.preview}</span>
        </div>
        <div class="template-name">${tmpl.name}</div>
      </div>
    `).join('');

    // Template selection events
    container.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectTemplate(card.dataset.template);
        container.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  /**
   * Render customization controls
   */
  renderCustomizationControls() {
    const container = document.getElementById('customization-controls');
    const tmpl = getTemplate(this.selectedTemplate);

    container.innerHTML = `
      <!-- Font Family -->
      <div class="control-group">
        <label class="control-label">Font</label>
        <select id="font-select" class="select select-full">
          ${Object.keys(FONT_FAMILIES).map(font => `
            <option value="${font}" ${font === tmpl.typography.fontFamily ? 'selected' : ''}>
              ${font}
            </option>
          `).join('')}
        </select>
      </div>

      <!-- Color Theme -->
      <div class="control-group">
        <label class="control-label">Color Theme</label>
        <div class="color-theme-picker">
          ${Object.values(COLOR_THEMES).map(theme => `
            <button class="color-swatch ${theme.id === tmpl.colors.id ? 'selected' : ''}"
                    data-theme="${theme.id}"
                    style="background: ${theme.background}; border-color: ${theme.accent}"
                    title="${theme.name}">
              <span style="color: ${theme.text}">A</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Frame Shape -->
      <div class="control-group">
        <label class="control-label">Image Frame</label>
        <div class="frame-picker">
          ${Object.values(FRAME_SHAPES).slice(0, 8).map(frame => `
            <button class="frame-option ${frame.id === tmpl.layout.image.frame ? 'selected' : ''}"
                    data-frame="${frame.id}"
                    title="${frame.name}">
              <svg viewBox="0 0 40 40" width="32" height="32">
                <g transform="translate(4, 4)" fill="currentColor" opacity="0.6">
                  ${frame.svg(32, 32)}
                </g>
              </svg>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Font Size -->
      <div class="control-group">
        <label class="control-label">
          Text Size
          <span id="font-size-value">${tmpl.typography.baseFontSize}px</span>
        </label>
        <input type="range" id="font-size-slider" class="slider"
               min="14" max="32" step="1"
               value="${tmpl.typography.baseFontSize}">
      </div>

      <!-- Page Size -->
      <div class="control-group">
        <label class="control-label">Page Size</label>
        <select id="page-size-select" class="select select-full">
          ${Object.entries(PAGE_DIMENSIONS).map(([key, dim]) => `
            <option value="${key}" ${key === 'square-medium' ? 'selected' : ''}>
              ${dim.name}
            </option>
          `).join('')}
        </select>
      </div>
    `;

    // Bind customization events
    this.bindCustomizationEvents();
  }

  /**
   * Render export options
   */
  renderExportOptions() {
    const container = document.getElementById('export-options');

    container.innerHTML = `
      <div class="control-group">
        <label class="control-label">Quality</label>
        <select id="export-quality" class="select select-full">
          <option value="draft">Draft (faster, smaller)</option>
          <option value="standard" selected>Standard</option>
          <option value="high">High Quality</option>
          <option value="print">Print Ready</option>
        </select>
      </div>

      <div class="export-estimate">
        <span id="export-estimate-text">~${this.bookData?.pages?.length * 200 || 0} KB</span>
      </div>

      <div class="export-formats">
        ${Object.values(EXPORT_FORMATS).filter(f => f.available).map(format => `
          <button class="export-format-btn" data-format="${format.id}">
            <span class="format-icon">${format.id === 'pdf' ? '📄' : '🖼'}</span>
            <span class="format-name">${format.name}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render the main preview
   */
  renderPreview() {
    if (!this.bookData?.pages?.length) return;

    const container = document.getElementById('page-preview');
    const pageData = this.bookData.pages[this.currentPageIndex];
    const tmpl = getTemplate(this.selectedTemplate);

    // Apply customizations
    const config = this.applyCustomizations(tmpl);

    // Render page
    this.renderer.renderToContainer(container, pageData, config, this.customizations);

    // Update page indicator
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
      indicator.textContent = `Page ${this.currentPageIndex + 1} of ${this.bookData.pages.length}`;
    }

    // Update navigation buttons
    document.getElementById('prev-page')?.classList.toggle('disabled', this.currentPageIndex === 0);
    document.getElementById('next-page')?.classList.toggle('disabled', 
      this.currentPageIndex === this.bookData.pages.length - 1);
  }

  /**
   * Render page thumbnails
   */
  renderThumbnails() {
    if (!this.bookData?.pages?.length) return;

    const container = document.getElementById('preview-thumbnails');
    const tmpl = getTemplate(this.selectedTemplate);
    const config = this.applyCustomizations(tmpl);

    // Create mini renderer
    const miniRenderer = new PageRenderer({ pageSize: 'square-small' });

    container.innerHTML = this.bookData.pages.map((page, i) => `
      <div class="thumbnail ${i === this.currentPageIndex ? 'active' : ''}" 
           data-page-index="${i}">
        <div class="thumbnail-inner" id="thumb-${i}"></div>
        <span class="thumbnail-number">${page.page}</span>
      </div>
    `).join('');

    // Render each thumbnail (async for performance)
    this.bookData.pages.forEach((page, i) => {
      const thumbContainer = document.getElementById(`thumb-${i}`);
      if (thumbContainer) {
        // Simplified render for thumbnails
        thumbContainer.innerHTML = `
          <div style="
            width: 100%; 
            height: 100%; 
            background: ${config.colors.background};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: ${config.colors.text};
            padding: 4px;
            text-align: center;
            overflow: hidden;
          ">
            ${page.imageUrl ? `<img src="${page.imageUrl}" style="max-width: 80%; max-height: 60%; object-fit: cover; border-radius: 4px;">` : ''}
          </div>
        `;
      }
    });

    // Thumbnail click events
    container.querySelectorAll('.thumbnail').forEach(thumb => {
      thumb.addEventListener('click', () => {
        this.currentPageIndex = parseInt(thumb.dataset.pageIndex);
        this.renderPreview();
        this.updateThumbnailSelection();
      });
    });
  }

  /**
   * Update thumbnail selection state
   */
  updateThumbnailSelection() {
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach((thumb, i) => {
      thumb.classList.toggle('active', i === this.currentPageIndex);
    });
  }

  /**
   * Select a template
   */
  selectTemplate(templateId) {
    this.selectedTemplate = templateId;
    this.renderCustomizationControls();
    this.renderPreview();
    this.renderThumbnails();
    
    if (this.onTemplateChange) {
      this.onTemplateChange(templateId);
    }
  }

  /**
   * Apply customizations to template config
   */
  applyCustomizations(template) {
    const config = JSON.parse(JSON.stringify(template));

    // Apply font family
    if (this.customizations.fontFamily) {
      config.typography.fontFamily = this.customizations.fontFamily;
    }

    // Apply color theme
    if (this.customizations.colorTheme) {
      config.colors = COLOR_THEMES[this.customizations.colorTheme] || config.colors;
    }

    // Apply frame shape
    if (this.customizations.frame) {
      config.layout.image.frame = this.customizations.frame;
    }

    // Apply font size
    if (this.customizations.fontSize) {
      config.typography.baseFontSize = this.customizations.fontSize;
    }

    return config;
  }

  /**
   * Bind customization control events
   */
  bindCustomizationEvents() {
    // Font family
    document.getElementById('font-select')?.addEventListener('change', (e) => {
      this.customizations.fontFamily = e.target.value;
      this.preloadFonts([e.target.value]);
      this.renderPreview();
    });

    // Color theme
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        this.customizations.colorTheme = swatch.dataset.theme;
        this.renderPreview();
        this.renderThumbnails();
      });
    });

    // Frame shape
    document.querySelectorAll('.frame-option').forEach(option => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.frame-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        this.customizations.frame = option.dataset.frame;
        this.renderPreview();
      });
    });

    // Font size slider
    document.getElementById('font-size-slider')?.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      this.customizations.fontSize = size;
      document.getElementById('font-size-value').textContent = `${size}px`;
      this.renderPreview();
    });

    // Page size
    document.getElementById('page-size-select')?.addEventListener('change', (e) => {
      this.renderer = new PageRenderer({ pageSize: e.target.value });
      this.renderPreview();
    });

    // Export quality
    document.getElementById('export-quality')?.addEventListener('change', (e) => {
      const pageCount = this.bookData?.pages?.length || 1;
      const estimate = bookExporter.estimateFileSize(pageCount, e.target.value);
      document.getElementById('export-estimate-text').textContent = estimate;
    });
  }

  /**
   * Bind main UI events
   */
  bindEvents() {
    // Page navigation
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (this.currentPageIndex > 0) {
        this.currentPageIndex--;
        this.renderPreview();
        this.updateThumbnailSelection();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      if (this.currentPageIndex < this.bookData.pages.length - 1) {
        this.currentPageIndex++;
        this.renderPreview();
        this.updateThumbnailSelection();
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        document.getElementById('prev-page')?.click();
      } else if (e.key === 'ArrowRight') {
        document.getElementById('next-page')?.click();
      }
    });

    // Export button
    document.getElementById('export-btn')?.addEventListener('click', () => this.handleExport('pdf'));

    // Export format buttons
    document.querySelectorAll('.export-format-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleExport(btn.dataset.format));
    });
  }

  /**
   * Handle export
   */
  async handleExport(format = 'pdf') {
    if (this.isExporting) return;
    this.isExporting = true;

    const modal = document.getElementById('export-modal');
    const progressBar = modal?.querySelector('.progress-fill');
    const progressText = document.getElementById('export-progress-text');

    modal?.classList.remove('hidden');

    try {
      const quality = document.getElementById('export-quality')?.value || 'standard';
      const pageSize = document.getElementById('page-size-select')?.value || 'square-medium';
      
      const tmpl = getTemplate(this.selectedTemplate);
      const config = this.applyCustomizations(tmpl);

      const options = {
        pageSize,
        quality,
        overrides: this.customizations,
        filename: `${this.bookData.title || 'my-book'}.pdf`,
        onProgress: (progress) => {
          if (progressBar) {
            progressBar.style.width = `${progress.percent}%`;
          }
          if (progressText) {
            progressText.textContent = `Rendering page ${progress.current} of ${progress.total}...`;
          }
        },
      };

      if (format === 'pdf') {
        await bookExporter.downloadPDF(this.bookData, config, options);
      } else {
        await bookExporter.downloadImagesZip(this.bookData, config, { ...options, format });
      }

      if (progressText) {
        progressText.textContent = 'Export complete!';
      }

      if (this.onExportComplete) {
        this.onExportComplete(format);
      }

      // Close modal after delay
      setTimeout(() => {
        modal?.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
      }, 1500);

    } catch (error) {
      console.error('Export failed:', error);
      if (progressText) {
        progressText.textContent = `Export failed: ${error.message}`;
      }
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * Preload fonts for current template
   */
  async preloadFonts(additionalFonts = []) {
    const tmpl = getTemplate(this.selectedTemplate);
    const fonts = [tmpl.typography?.fontFamily, ...additionalFonts].filter(Boolean);
    await this.renderer.preloadFonts(fonts);
  }
}

// Export factory function
export function createCompositorUI(containerId) {
  return new CompositorUI(containerId);
}