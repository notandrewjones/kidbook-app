// js/compositor/ui.js
// Canva-style UI for book compositor

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
 * CompositorUI - Canva-style book composition interface
 */
export class CompositorUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.renderer = new PageRenderer();
    
    // State
    this.bookData = null;
    this.selectedTemplate = 'classic-bottom';
    this.customizations = {
      imageScale: 1.0,
      imageOffsetX: 0,
      imageOffsetY: 0,
    };
    this.currentPageIndex = 0;
    this.isExporting = false;
    this.isRendering = false;
    
    // Selection state for taskbar
    this.selectedElement = null; // 'text' | 'image' | null
    
    // Callbacks
    this.onExportComplete = null;
    this.onTemplateChange = null;
  }

  initialize(bookData) {
    this.bookData = bookData;
    this.currentPageIndex = 0;
    this.render();
    this.preloadFonts();
  }

  updateBookData(bookData) {
    this.bookData = bookData;
    this.renderPreview();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="compositor-canva">
        <!-- Top Header Bar -->
        <header class="compositor-topbar">
          <div class="topbar-left">
            <button id="back-btn" class="topbar-btn" title="Back to Storyboard">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="topbar-divider"></div>
            <span class="topbar-title">${this.bookData?.title || 'Book Layout'}</span>
          </div>
          <div class="topbar-center">
            <button id="prev-page" class="topbar-btn" title="Previous page">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <span id="page-indicator" class="page-indicator">Page 1 of ${this.bookData?.pages?.length || 1}</span>
            <button id="next-page" class="topbar-btn" title="Next page">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
          <div class="topbar-right">
            <select id="page-size-select" class="topbar-select">
              ${Object.entries(PAGE_DIMENSIONS).map(([key, dim]) => `
                <option value="${key}" ${key === 'square-medium' ? 'selected' : ''}>
                  ${dim.name}
                </option>
              `).join('')}
            </select>
            <button id="export-btn" class="topbar-btn topbar-btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              <span>Export</span>
            </button>
          </div>
        </header>

        <!-- Main Layout -->
        <div class="compositor-main">
          <!-- Left Sidebar - Templates Only -->
          <aside class="compositor-sidebar">
            <div class="sidebar-header">
              <h3>Templates</h3>
            </div>
            <div id="template-categories" class="template-categories"></div>
            <div id="template-gallery" class="template-gallery"></div>
          </aside>

          <!-- Center - Canvas/Preview Area -->
          <main class="compositor-canvas-area">
            <div class="canvas-container">
              <div id="page-preview" class="page-preview" data-selected="">
                <div class="preview-loading">
                  <div class="spinner"></div>
                </div>
              </div>
            </div>
            
            <!-- Page Thumbnails -->
            <div class="thumbnails-strip">
              <div id="preview-thumbnails" class="preview-thumbnails"></div>
            </div>
          </main>
        </div>

        <!-- Floating Bottom Taskbar -->
        <div id="floating-taskbar" class="floating-taskbar hidden">
          <div id="taskbar-content" class="taskbar-content">
            <!-- Content populated based on selection -->
          </div>
        </div>

        <!-- Export Modal -->
        <div id="export-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>Export Book</h3>
              <button id="close-export-modal" class="modal-close">×</button>
            </div>
            <div class="modal-body">
              <div class="export-options-grid">
                <div class="export-option" data-format="pdf">
                  <div class="export-option-icon">📄</div>
                  <div class="export-option-label">PDF Document</div>
                  <div class="export-option-desc">Best for printing</div>
                </div>
                <div class="export-option" data-format="png">
                  <div class="export-option-icon">🖼️</div>
                  <div class="export-option-label">PNG Images</div>
                  <div class="export-option-desc">High quality images</div>
                </div>
              </div>
              <div class="export-quality">
                <label>Quality</label>
                <select id="export-quality">
                  <option value="draft">Draft (Fast)</option>
                  <option value="standard" selected>Standard</option>
                  <option value="high">High Quality</option>
                  <option value="print">Print Ready</option>
                </select>
              </div>
              <div id="export-progress" class="export-progress hidden">
                <div class="progress-bar">
                  <div id="export-progress-fill" class="progress-fill"></div>
                </div>
                <div id="export-progress-text" class="progress-text">Preparing...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderTemplateGallery();
    this.renderPreview();
    this.renderThumbnails();
    this.bindEvents();
  }

  /**
   * Render template gallery with visual previews
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

    this.renderTemplatesByCategory('classic', galleryContainer);

    categoriesContainer.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        categoriesContainer.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderTemplatesByCategory(tab.dataset.category, galleryContainer);
      });
    });
  }

  /**
   * Render templates with visual mini-previews
   */
  renderTemplatesByCategory(category, container) {
    const templates = getAllTemplates().filter(t => t.category === category);

    container.innerHTML = templates.map(tmpl => `
      <div class="template-card ${tmpl.id === this.selectedTemplate ? 'selected' : ''}" 
           data-template="${tmpl.id}">
        <div class="template-preview-visual" style="background: ${tmpl.colors?.background || '#fff'}">
          ${this.generateTemplateMiniPreview(tmpl)}
        </div>
        <div class="template-info">
          <span class="template-name">${tmpl.name}</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectTemplate(card.dataset.template);
        container.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  /**
   * Generate a mini SVG preview of a template
   */
  generateTemplateMiniPreview(template) {
    const w = 120;
    const h = 120;
    const imgConfig = template.layout?.image || {};
    const textConfig = template.layout?.text || {};
    const imgPos = imgConfig.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
    const textPos = textConfig.position?.region || { x: 0.05, y: 0.7, width: 0.9, height: 0.25 };
    const frameType = imgConfig.frame || 'rectangle';
    
    // Calculate positions
    const imgX = imgPos.x * w;
    const imgY = imgPos.y * h;
    const imgW = imgPos.width * w;
    const imgH = imgPos.height * h;
    
    const textX = textPos.x * w;
    const textY = textPos.y * h;
    const textW = textPos.width * w;
    const textH = textPos.height * h;

    // Generate frame shape path
    let framePath = '';
    const colors = template.colors || {};
    
    switch (frameType) {
      case 'circle':
        const r = Math.min(imgW, imgH) / 2;
        framePath = `<circle cx="${imgX + imgW/2}" cy="${imgY + imgH/2}" r="${r}" fill="${colors.accent || '#ddd'}"/>`;
        break;
      case 'oval':
        framePath = `<ellipse cx="${imgX + imgW/2}" cy="${imgY + imgH/2}" rx="${imgW/2}" ry="${imgH/2}" fill="${colors.accent || '#ddd'}"/>`;
        break;
      case 'rounded':
        const rad = Math.min(imgW, imgH) * 0.1;
        framePath = `<rect x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" rx="${rad}" fill="${colors.accent || '#ddd'}"/>`;
        break;
      case 'cloud':
        framePath = `<ellipse cx="${imgX + imgW/2}" cy="${imgY + imgH/2}" rx="${imgW/2}" ry="${imgH/2.2}" fill="${colors.accent || '#ddd'}"/>`;
        break;
      case 'heart':
        framePath = `<path d="M${imgX + imgW/2} ${imgY + imgH*0.85} C${imgX + imgW*0.15} ${imgY + imgH*0.5} ${imgX + imgW*0.15} ${imgY + imgH*0.2} ${imgX + imgW/2} ${imgY + imgH*0.35} C${imgX + imgW*0.85} ${imgY + imgH*0.2} ${imgX + imgW*0.85} ${imgY + imgH*0.5} ${imgX + imgW/2} ${imgY + imgH*0.85}Z" fill="${colors.accent || '#ddd'}"/>`;
        break;
      case 'star':
        framePath = `<polygon points="${imgX + imgW/2},${imgY} ${imgX + imgW*0.62},${imgY + imgH*0.38} ${imgX + imgW},${imgY + imgH*0.38} ${imgX + imgW*0.69},${imgY + imgH*0.62} ${imgX + imgW*0.81},${imgY + imgH} ${imgX + imgW/2},${imgY + imgH*0.77} ${imgX + imgW*0.19},${imgY + imgH} ${imgX + imgW*0.31},${imgY + imgH*0.62} ${imgX},${imgY + imgH*0.38} ${imgX + imgW*0.38},${imgY + imgH*0.38}" fill="${colors.accent || '#ddd'}"/>`;
        break;
      default:
        framePath = `<rect x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" fill="${colors.accent || '#ddd'}"/>`;
    }

    // Text lines representation
    const textLines = `
      <rect x="${textX + textW*0.1}" y="${textY + textH*0.2}" width="${textW*0.8}" height="4" rx="2" fill="${colors.text || '#333'}" opacity="0.6"/>
      <rect x="${textX + textW*0.2}" y="${textY + textH*0.5}" width="${textW*0.6}" height="4" rx="2" fill="${colors.text || '#333'}" opacity="0.4"/>
    `;

    return `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">
        ${framePath}
        ${textLines}
      </svg>
    `;
  }

  /**
   * Show floating taskbar with context-specific controls
   */
  showTaskbar(elementType) {
    const taskbar = document.getElementById('floating-taskbar');
    const content = document.getElementById('taskbar-content');
    
    this.selectedElement = elementType;
    
    if (elementType === 'image') {
      content.innerHTML = this.renderImageTaskbar();
      this.bindImageTaskbarEvents();
    } else if (elementType === 'text') {
      content.innerHTML = this.renderTextTaskbar();
      this.bindTextTaskbarEvents();
    }
    
    taskbar.classList.remove('hidden');
  }

  hideTaskbar() {
    const taskbar = document.getElementById('floating-taskbar');
    taskbar.classList.add('hidden');
    this.selectedElement = null;
  }

  /**
   * Render image/frame taskbar controls
   */
  renderImageTaskbar() {
    const tmpl = getTemplate(this.selectedTemplate);
    const currentFrame = this.customizations.frame || tmpl.layout?.image?.frame || 'rounded';
    
    return `
      <div class="taskbar-section">
        <label class="taskbar-label">Frame</label>
        <div class="taskbar-frames">
          ${Object.values(FRAME_SHAPES).slice(0, 8).map(frame => `
            <button class="taskbar-frame-btn ${frame.id === currentFrame ? 'active' : ''}" 
                    data-frame="${frame.id}" title="${frame.name}">
              <svg viewBox="0 0 32 32" width="24" height="24">
                ${this.getFrameIconSVG(frame.id)}
              </svg>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Size</label>
        <div class="taskbar-scale">
          <button class="taskbar-btn" id="scale-down" title="Smaller">−</button>
          <span class="taskbar-scale-value" id="scale-value">${Math.round((this.customizations.imageScale || 1) * 100)}%</span>
          <button class="taskbar-btn" id="scale-up" title="Larger">+</button>
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Position</label>
        <div class="taskbar-position">
          <button class="taskbar-btn" id="pos-up" title="Move up">↑</button>
          <button class="taskbar-btn" id="pos-down" title="Move down">↓</button>
          <button class="taskbar-btn" id="pos-left" title="Move left">←</button>
          <button class="taskbar-btn" id="pos-right" title="Move right">→</button>
          <button class="taskbar-btn" id="pos-reset" title="Reset position">⟲</button>
        </div>
      </div>
    `;
  }

  /**
   * Get simplified SVG icon for frame type
   */
  getFrameIconSVG(frameType) {
    switch (frameType) {
      case 'rectangle':
        return '<rect x="4" y="6" width="24" height="20" fill="currentColor" opacity="0.6"/>';
      case 'rounded':
        return '<rect x="4" y="6" width="24" height="20" rx="4" fill="currentColor" opacity="0.6"/>';
      case 'circle':
        return '<circle cx="16" cy="16" r="12" fill="currentColor" opacity="0.6"/>';
      case 'oval':
        return '<ellipse cx="16" cy="16" rx="14" ry="10" fill="currentColor" opacity="0.6"/>';
      case 'cloud':
        return '<path d="M8 20 Q4 20 4 16 Q4 12 8 12 Q8 8 14 8 Q20 6 24 12 Q28 12 28 16 Q28 20 24 20 Z" fill="currentColor" opacity="0.6"/>';
      case 'heart':
        return '<path d="M16 26 C6 18 4 12 10 8 C14 6 16 10 16 10 C16 10 18 6 22 8 C28 12 26 18 16 26Z" fill="currentColor" opacity="0.6"/>';
      case 'star':
        return '<polygon points="16,4 19,12 28,12 21,18 24,28 16,22 8,28 11,18 4,12 13,12" fill="currentColor" opacity="0.6"/>';
      case 'hexagon':
        return '<polygon points="16,4 28,10 28,22 16,28 4,22 4,10" fill="currentColor" opacity="0.6"/>';
      default:
        return '<rect x="4" y="6" width="24" height="20" fill="currentColor" opacity="0.6"/>';
    }
  }

  /**
   * Render text taskbar controls
   */
  renderTextTaskbar() {
    const tmpl = getTemplate(this.selectedTemplate);
    const currentFont = this.customizations.fontFamily || tmpl.typography?.fontFamily || 'Merriweather';
    const currentSize = this.customizations.fontSize || tmpl.typography?.baseFontSize || 18;
    
    return `
      <div class="taskbar-section">
        <label class="taskbar-label">Font</label>
        <select id="taskbar-font" class="taskbar-select">
          ${Object.keys(FONT_FAMILIES).map(font => `
            <option value="${font}" ${font === currentFont ? 'selected' : ''}>${font}</option>
          `).join('')}
        </select>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Size</label>
        <div class="taskbar-fontsize">
          <button class="taskbar-btn" id="fontsize-down">−</button>
          <span class="taskbar-size-value" id="fontsize-value">${currentSize}px</span>
          <button class="taskbar-btn" id="fontsize-up">+</button>
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Color Theme</label>
        <div class="taskbar-colors">
          ${Object.values(COLOR_THEMES).slice(0, 6).map(theme => `
            <button class="taskbar-color-btn ${theme.id === (this.customizations.colorTheme || 'cream') ? 'active' : ''}"
                    data-theme="${theme.id}"
                    style="background: ${theme.background}; border-color: ${theme.accent}"
                    title="${theme.name}">
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindImageTaskbarEvents() {
    // Frame selection
    document.querySelectorAll('.taskbar-frame-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taskbar-frame-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.frame = btn.dataset.frame;
        this.renderPreview();
      });
    });

    // Scale controls
    document.getElementById('scale-down')?.addEventListener('click', () => {
      this.customizations.imageScale = Math.max(0.5, (this.customizations.imageScale || 1) - 0.1);
      document.getElementById('scale-value').textContent = `${Math.round(this.customizations.imageScale * 100)}%`;
      this.renderPreview();
    });

    document.getElementById('scale-up')?.addEventListener('click', () => {
      this.customizations.imageScale = Math.min(1.5, (this.customizations.imageScale || 1) + 0.1);
      document.getElementById('scale-value').textContent = `${Math.round(this.customizations.imageScale * 100)}%`;
      this.renderPreview();
    });

    // Position controls
    const posStep = 0.02;
    document.getElementById('pos-up')?.addEventListener('click', () => {
      this.customizations.imageOffsetY = (this.customizations.imageOffsetY || 0) - posStep;
      this.renderPreview();
    });
    document.getElementById('pos-down')?.addEventListener('click', () => {
      this.customizations.imageOffsetY = (this.customizations.imageOffsetY || 0) + posStep;
      this.renderPreview();
    });
    document.getElementById('pos-left')?.addEventListener('click', () => {
      this.customizations.imageOffsetX = (this.customizations.imageOffsetX || 0) - posStep;
      this.renderPreview();
    });
    document.getElementById('pos-right')?.addEventListener('click', () => {
      this.customizations.imageOffsetX = (this.customizations.imageOffsetX || 0) + posStep;
      this.renderPreview();
    });
    document.getElementById('pos-reset')?.addEventListener('click', () => {
      this.customizations.imageOffsetX = 0;
      this.customizations.imageOffsetY = 0;
      this.customizations.imageScale = 1;
      document.getElementById('scale-value').textContent = '100%';
      this.renderPreview();
    });
  }

  bindTextTaskbarEvents() {
    // Font selection
    document.getElementById('taskbar-font')?.addEventListener('change', (e) => {
      this.customizations.fontFamily = e.target.value;
      this.preloadFonts([e.target.value]);
      this.renderPreview();
    });

    // Font size
    document.getElementById('fontsize-down')?.addEventListener('click', () => {
      this.customizations.fontSize = Math.max(12, (this.customizations.fontSize || 18) - 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreview();
    });

    document.getElementById('fontsize-up')?.addEventListener('click', () => {
      this.customizations.fontSize = Math.min(36, (this.customizations.fontSize || 18) + 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreview();
    });

    // Color theme
    document.querySelectorAll('.taskbar-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taskbar-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.colorTheme = btn.dataset.theme;
        this.renderPreview();
        this.renderThumbnails();
      });
    });
  }

  async renderPreview() {
    if (!this.bookData?.pages?.length) return;
    if (this.isRendering) return;
    
    this.isRendering = true;

    const container = document.getElementById('page-preview');
    const pageData = this.bookData.pages[this.currentPageIndex];
    const tmpl = getTemplate(this.selectedTemplate);
    const config = this.applyCustomizations(tmpl);

    container.innerHTML = `<div class="preview-loading"><div class="spinner"></div></div>`;

    try {
      await this.renderer.renderToContainer(container, pageData, config, this.customizations);
      
      // Add click handlers to SVG elements for selection
      this.setupPreviewInteraction(container);
    } catch (error) {
      console.error('Failed to render preview:', error);
      container.innerHTML = `<div class="preview-error">Failed to load preview</div>`;
    }
    
    this.isRendering = false;
    this.updatePageIndicator();
  }

  setupPreviewInteraction(container) {
    const svg = container.querySelector('svg');
    if (!svg) return;

    // Make the preview clickable
    svg.style.cursor = 'pointer';
    
    // Click on image area
    const imageEl = svg.querySelector('image');
    if (imageEl) {
      imageEl.style.cursor = 'pointer';
      imageEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showTaskbar('image');
        container.dataset.selected = 'image';
      });
    }

    // Click on text area
    const textGroup = svg.querySelector('g');
    if (textGroup) {
      textGroup.style.cursor = 'pointer';
      textGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showTaskbar('text');
        container.dataset.selected = 'text';
      });
    }

    // Click outside to deselect
    svg.addEventListener('click', () => {
      this.hideTaskbar();
      container.dataset.selected = '';
    });
  }

  renderThumbnails() {
    if (!this.bookData?.pages?.length) return;

    const container = document.getElementById('preview-thumbnails');
    const tmpl = getTemplate(this.selectedTemplate);
    const config = this.applyCustomizations(tmpl);

    container.innerHTML = this.bookData.pages.map((page, i) => `
      <div class="thumbnail ${i === this.currentPageIndex ? 'active' : ''}" data-page-index="${i}">
        <div class="thumbnail-inner">
          ${page.imageUrl 
            ? `<img src="${page.imageUrl}" alt="Page ${page.page}">`
            : `<div class="thumbnail-placeholder" style="background:${config.colors?.background || '#fff'}">
                <span>${page.page}</span>
              </div>`
          }
        </div>
        <span class="thumbnail-number">${page.page}</span>
      </div>
    `).join('');

    container.querySelectorAll('.thumbnail').forEach(thumb => {
      thumb.addEventListener('click', () => {
        this.currentPageIndex = parseInt(thumb.dataset.pageIndex);
        this.renderPreview();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      });
    });
  }

  updateThumbnailSelection() {
    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === this.currentPageIndex);
    });
  }

  updatePageIndicator() {
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
      indicator.textContent = `Page ${this.currentPageIndex + 1} of ${this.bookData.pages.length}`;
    }
  }

  selectTemplate(templateId) {
    this.selectedTemplate = templateId;
    // Reset customizations when changing templates
    this.customizations = {
      imageScale: 1.0,
      imageOffsetX: 0,
      imageOffsetY: 0,
    };
    this.renderPreview();
    this.renderThumbnails();
    this.hideTaskbar();
    
    if (this.onTemplateChange) {
      this.onTemplateChange(templateId);
    }
  }

  applyCustomizations(template) {
    const config = JSON.parse(JSON.stringify(template));

    // Font
    if (this.customizations.fontFamily) {
      config.typography = config.typography || {};
      config.typography.fontFamily = this.customizations.fontFamily;
    }

    // Font size
    if (this.customizations.fontSize) {
      config.typography = config.typography || {};
      config.typography.baseFontSize = this.customizations.fontSize;
    }

    // Color theme
    if (this.customizations.colorTheme) {
      config.colors = COLOR_THEMES[this.customizations.colorTheme] || config.colors;
    }

    // Frame shape
    if (this.customizations.frame) {
      config.layout = config.layout || {};
      config.layout.image = config.layout.image || {};
      config.layout.image.frame = this.customizations.frame;
    }

    // Image scale and position
    if (this.customizations.imageScale !== 1 || this.customizations.imageOffsetX || this.customizations.imageOffsetY) {
      config.layout = config.layout || {};
      config.layout.image = config.layout.image || {};
      const pos = config.layout.image.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
      
      // Apply scale (shrink from center)
      const scale = this.customizations.imageScale || 1;
      const newWidth = pos.width * scale;
      const newHeight = pos.height * scale;
      const xOffset = (pos.width - newWidth) / 2;
      const yOffset = (pos.height - newHeight) / 2;
      
      config.layout.image.position = {
        ...config.layout.image.position,
        region: {
          x: pos.x + xOffset + (this.customizations.imageOffsetX || 0),
          y: pos.y + yOffset + (this.customizations.imageOffsetY || 0),
          width: newWidth,
          height: newHeight,
        }
      };
    }

    return config;
  }

  bindEvents() {
    // Page navigation
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (this.currentPageIndex > 0) {
        this.currentPageIndex--;
        this.renderPreview();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      if (this.currentPageIndex < this.bookData.pages.length - 1) {
        this.currentPageIndex++;
        this.renderPreview();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') document.getElementById('prev-page')?.click();
      else if (e.key === 'ArrowRight') document.getElementById('next-page')?.click();
      else if (e.key === 'Escape') this.hideTaskbar();
    });

    // Page size
    document.getElementById('page-size-select')?.addEventListener('change', (e) => {
      this.renderer = new PageRenderer({ pageSize: e.target.value });
      this.renderPreview();
    });

    // Export button
    document.getElementById('export-btn')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.remove('hidden');
    });

    // Close export modal
    document.getElementById('close-export-modal')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.add('hidden');
    });

    document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.add('hidden');
    });

    // Export options
    document.querySelectorAll('.export-option').forEach(opt => {
      opt.addEventListener('click', () => {
        this.handleExport(opt.dataset.format);
      });
    });

    // Click outside preview to deselect
    document.querySelector('.compositor-canvas-area')?.addEventListener('click', (e) => {
      if (e.target.closest('.page-preview')) return;
      this.hideTaskbar();
    });
  }

  async handleExport(format = 'pdf') {
    if (this.isExporting) return;
    this.isExporting = true;

    const progressContainer = document.getElementById('export-progress');
    const progressFill = document.getElementById('export-progress-fill');
    const progressText = document.getElementById('export-progress-text');

    progressContainer?.classList.remove('hidden');

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
          if (progressFill) progressFill.style.width = `${progress.percent}%`;
          if (progressText) progressText.textContent = `Rendering page ${progress.current} of ${progress.total}...`;
        },
      };

      if (format === 'pdf') {
        await bookExporter.downloadPDF(this.bookData, config, options);
      } else {
        await bookExporter.downloadImagesZip(this.bookData, config, { ...options, format });
      }

      if (progressText) progressText.textContent = 'Export complete!';
      
      if (this.onExportComplete) this.onExportComplete(format);

      setTimeout(() => {
        document.getElementById('export-modal')?.classList.add('hidden');
        progressContainer?.classList.add('hidden');
        if (progressFill) progressFill.style.width = '0%';
      }, 1500);

    } catch (error) {
      console.error('Export failed:', error);
      if (progressText) progressText.textContent = `Export failed: ${error.message}`;
    } finally {
      this.isExporting = false;
    }
  }

  async preloadFonts(additionalFonts = []) {
    const tmpl = getTemplate(this.selectedTemplate);
    const fonts = [tmpl.typography?.fontFamily, ...additionalFonts].filter(Boolean);
    await this.renderer.preloadFonts(fonts);
  }
}

export function createCompositorUI(containerId) {
  return new CompositorUI(containerId);
}