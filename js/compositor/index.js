// js/compositor/index.js
// Main entry point for the book compositor module

// Core exports
export { 
  TEMPLATES, 
  FRAME_SHAPES, 
  FONT_FAMILIES, 
  COLOR_THEMES,
  TEXT_POSITIONS,
  IMAGE_POSITIONS,
  getAllTemplates,
  getTemplate,
  getTemplatesByCategory,
  getCategories,
  customizeTemplate,
} from './templates.js';

export { 
  PageRenderer, 
  pageRenderer,
  PAGE_DIMENSIONS,
} from './renderer.js';

export { 
  BookExporter, 
  bookExporter,
  EXPORT_FORMATS,
} from './exporter.js';

export { 
  CompositorUI,
  createCompositorUI,
} from './ui.js';

// Version
export const VERSION = '1.0.0';

/**
 * Quick start helper - creates a compositor with common setup
 * 
 * @example
 * import { initCompositor } from './compositor/index.js';
 * 
 * const compositor = initCompositor('compositor-container', {
 *   pages: project.story_json.map((p, i) => ({
 *     page: p.page,
 *     text: p.text,
 *     imageUrl: project.illustrations[i]?.image_url
 *   })),
 *   title: project.selected_idea?.title,
 *   author: project.kid_name
 * });
 */
export function initCompositor(containerId, bookData, options = {}) {
  const { createCompositorUI } = require('./ui.js');
  const compositor = createCompositorUI(containerId);
  
  if (bookData) {
    compositor.initialize(bookData);
  }
  
  // Apply options
  if (options.template) {
    compositor.selectTemplate(options.template);
  }
  
  if (options.onExportComplete) {
    compositor.onExportComplete = options.onExportComplete;
  }
  
  if (options.onTemplateChange) {
    compositor.onTemplateChange = options.onTemplateChange;
  }
  
  return compositor;
}

/**
 * Convert project data to compositor format
 */
export function projectToBookData(project) {
  if (!project) return null;
  
  const pages = (project.story_json || []).map((page, index) => {
    const illustration = (project.illustrations || []).find(
      i => Number(i.page) === Number(page.page)
    );
    
    return {
      page: page.page,
      text: page.text,
      imageUrl: illustration?.image_url || null,
    };
  });
  
  return {
    pages,
    title: project.selected_idea?.title || `Book for ${project.kid_name}`,
    author: project.kid_name || 'Author',
    projectId: project.id,
  };
}

/**
 * Check if a project is ready for composition
 * (has story and at least some illustrations)
 */
export function isProjectReadyForComposition(project) {
  if (!project) return false;
  if (!project.story_json?.length) return false;
  if (!project.illustrations?.length) return false;
  
  // Check if at least 50% of pages have illustrations
  const pageCount = project.story_json.length;
  const illustratedCount = project.illustrations.filter(i => i.image_url).length;
  
  return illustratedCount >= Math.ceil(pageCount / 2);
}