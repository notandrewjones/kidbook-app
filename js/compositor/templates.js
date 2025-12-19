// js/compositor/templates.js
// Template definitions and schema for book page layouts

/**
 * Template Schema:
 * 
 * Each template defines how a page should be composed:
 * - id: unique identifier
 * - name: display name
 * - description: what it looks like
 * - category: grouping (classic, modern, playful, minimal)
 * - layout: positioning rules for image and text
 * - typography: font settings
 * - frame: image frame shape
 * - colors: color scheme
 * - effects: special visual effects
 */

// Available frame shapes
export const FRAME_SHAPES = {
  rectangle: {
    id: 'rectangle',
    name: 'Rectangle',
    svg: (width, height) => `<rect x="0" y="0" width="${width}" height="${height}" rx="0" ry="0"/>`,
  },
  rounded: {
    id: 'rounded',
    name: 'Rounded Rectangle',
    svg: (width, height) => `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.08}" ry="${Math.min(width, height) * 0.08}"/>`,
  },
  circle: {
    id: 'circle',
    name: 'Circle',
    svg: (width, height) => {
      const r = Math.min(width, height) / 2;
      return `<circle cx="${width/2}" cy="${height/2}" r="${r}"/>`;
    },
  },
  oval: {
    id: 'oval',
    name: 'Oval',
    svg: (width, height) => `<ellipse cx="${width/2}" cy="${height/2}" rx="${width/2}" ry="${height/2}"/>`,
  },
  cloud: {
    id: 'cloud',
    name: 'Cloud',
    svg: (width, height) => {
      // Soft cloud shape using bezier curves
      const w = width;
      const h = height;
      return `
        <path d="
          M ${w*0.15} ${h*0.7}
          Q ${w*0.05} ${h*0.7} ${w*0.05} ${h*0.55}
          Q ${w*0.05} ${h*0.35} ${w*0.2} ${h*0.3}
          Q ${w*0.15} ${h*0.15} ${w*0.35} ${h*0.15}
          Q ${w*0.45} ${h*0.05} ${w*0.6} ${h*0.12}
          Q ${w*0.8} ${h*0.08} ${w*0.85} ${h*0.3}
          Q ${w*0.95} ${h*0.35} ${w*0.95} ${h*0.55}
          Q ${w*0.95} ${h*0.75} ${w*0.8} ${h*0.78}
          Q ${w*0.75} ${h*0.88} ${w*0.55} ${h*0.85}
          Q ${w*0.4} ${h*0.92} ${w*0.25} ${h*0.82}
          Q ${w*0.15} ${h*0.85} ${w*0.15} ${h*0.7}
          Z
        "/>
      `;
    },
  },
  heart: {
    id: 'heart',
    name: 'Heart',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `
        <path d="
          M ${w*0.5} ${h*0.85}
          C ${w*0.15} ${h*0.55} ${w*0.05} ${h*0.35} ${w*0.25} ${h*0.2}
          C ${w*0.4} ${h*0.1} ${w*0.5} ${h*0.25} ${w*0.5} ${h*0.3}
          C ${w*0.5} ${h*0.25} ${w*0.6} ${h*0.1} ${w*0.75} ${h*0.2}
          C ${w*0.95} ${h*0.35} ${w*0.85} ${h*0.55} ${w*0.5} ${h*0.85}
          Z
        "/>
      `;
    },
  },
  star: {
    id: 'star',
    name: 'Star',
    svg: (width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2;
      const innerR = outerR * 0.4;
      const points = 5;
      let path = '';
      
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI / points) - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        path += (i === 0 ? 'M' : 'L') + ` ${x} ${y} `;
      }
      path += 'Z';
      return `<path d="${path}"/>`;
    },
  },
  hexagon: {
    id: 'hexagon',
    name: 'Hexagon',
    svg: (width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(width, height) / 2;
      let path = '';
      
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        path += (i === 0 ? 'M' : 'L') + ` ${x} ${y} `;
      }
      path += 'Z';
      return `<path d="${path}"/>`;
    },
  },
  arch: {
    id: 'arch',
    name: 'Arch',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `
        <path d="
          M 0 ${h}
          L 0 ${h*0.4}
          Q 0 0 ${w*0.5} 0
          Q ${w} 0 ${w} ${h*0.4}
          L ${w} ${h}
          Z
        "/>
      `;
    },
  },
  blob: {
    id: 'blob',
    name: 'Organic Blob',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `
        <path d="
          M ${w*0.5} ${h*0.05}
          Q ${w*0.85} ${h*0.08} ${w*0.92} ${h*0.35}
          Q ${w*0.98} ${h*0.6} ${w*0.82} ${h*0.82}
          Q ${w*0.65} ${h*0.98} ${w*0.4} ${h*0.92}
          Q ${w*0.12} ${h*0.88} ${w*0.08} ${h*0.58}
          Q ${w*0.02} ${h*0.28} ${w*0.22} ${h*0.12}
          Q ${w*0.35} ${h*0.02} ${w*0.5} ${h*0.05}
          Z
        "/>
      `;
    },
  },
  scallop: {
    id: 'scallop',
    name: 'Scalloped Edge',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const scallops = 8;
      const scW = w / scallops;
      const scH = h / scallops;
      const depth = 0.12;
      
      let path = `M 0 ${h * depth}`;
      
      // Top edge
      for (let i = 0; i < scallops; i++) {
        const x1 = i * scW + scW * 0.5;
        const x2 = (i + 1) * scW;
        path += ` Q ${x1} 0 ${x2} ${h * depth}`;
      }
      
      // Right edge
      for (let i = 0; i < scallops; i++) {
        const y1 = i * scH + scH * 0.5;
        const y2 = (i + 1) * scH;
        path += ` Q ${w} ${y1} ${w - w * depth} ${y2}`;
      }
      
      // Bottom edge (reversed)
      path += ` L ${w - w * depth} ${h}`;
      for (let i = scallops - 1; i >= 0; i--) {
        const x1 = i * scW + scW * 0.5;
        const x2 = i * scW;
        path += ` Q ${x1} ${h} ${x2} ${h - h * depth}`;
      }
      
      // Left edge
      path += ` L 0 ${h - h * depth}`;
      for (let i = scallops - 1; i >= 0; i--) {
        const y1 = i * scH + scH * 0.5;
        const y2 = i * scH;
        path += ` Q 0 ${y1} ${w * depth} ${y2}`;
      }
      
      path += ' Z';
      return `<path d="${path}"/>`;
    },
  },
};

// Available font families (web-safe + Google Fonts we'll load)
export const FONT_FAMILIES = {
  // Playful / Children's
  'Fredoka One': { category: 'playful', weight: '400', googleFont: true },
  'Bubblegum Sans': { category: 'playful', weight: '400', googleFont: true },
  'Patrick Hand': { category: 'playful', weight: '400', googleFont: true },
  'Comic Neue': { category: 'playful', weight: '400,700', googleFont: true },
  'Baloo 2': { category: 'playful', weight: '400,600,700', googleFont: true },
  
  // Classic / Elegant
  'Playfair Display': { category: 'classic', weight: '400,600,700', googleFont: true },
  'Merriweather': { category: 'classic', weight: '400,700', googleFont: true },
  'Libre Baskerville': { category: 'classic', weight: '400,700', googleFont: true },
  'Crimson Text': { category: 'classic', weight: '400,600,700', googleFont: true },
  
  // Modern / Clean
  'Poppins': { category: 'modern', weight: '400,500,600,700', googleFont: true },
  'Nunito': { category: 'modern', weight: '400,600,700', googleFont: true },
  'Quicksand': { category: 'modern', weight: '400,500,600,700', googleFont: true },
  'Raleway': { category: 'modern', weight: '400,500,600,700', googleFont: true },
  
  // Handwritten
  'Caveat': { category: 'handwritten', weight: '400,600,700', googleFont: true },
  'Kalam': { category: 'handwritten', weight: '400,700', googleFont: true },
  'Architects Daughter': { category: 'handwritten', weight: '400', googleFont: true },
  
  // System fallbacks
  'Georgia': { category: 'system', weight: '400,700', googleFont: false },
  'Arial': { category: 'system', weight: '400,700', googleFont: false },
};

// Color themes - vibrant and saturated options
export const COLOR_THEMES = {
  // Classic/Neutral (keep a few)
  cream: {
    id: 'cream',
    name: 'Classic Cream',
    background: '#FFFEF5',
    text: '#333333',
    accent: '#8B6914',
    secondary: '#D4A84B',
  },
  slate: {
    id: 'slate',
    name: 'Modern Slate',
    background: '#F8FAFC',
    text: '#334155',
    accent: '#475569',
    secondary: '#64748B',
  },
  
  // Vibrant Warm Colors
  sunflower: {
    id: 'sunflower',
    name: 'Sunflower',
    background: '#FFFDE7',
    text: '#5D4037',
    accent: '#FBC02D',
    secondary: '#FFEB3B',
  },
  tangerine: {
    id: 'tangerine',
    name: 'Tangerine',
    background: '#FFF3E0',
    text: '#BF360C',
    accent: '#FF6D00',
    secondary: '#FF9100',
  },
  coral: {
    id: 'coral',
    name: 'Coral Reef',
    background: '#FFF8F6',
    text: '#C62828',
    accent: '#FF5252',
    secondary: '#FF8A80',
  },
  cherry: {
    id: 'cherry',
    name: 'Cherry Pop',
    background: '#FFF5F5',
    text: '#B71C1C',
    accent: '#E53935',
    secondary: '#EF5350',
  },
  
  // Vibrant Cool Colors
  ocean: {
    id: 'ocean',
    name: 'Ocean Blue',
    background: '#E3F2FD',
    text: '#0D47A1',
    accent: '#1E88E5',
    secondary: '#42A5F5',
  },
  royal: {
    id: 'royal',
    name: 'Royal Blue',
    background: '#E8EAF6',
    text: '#1A237E',
    accent: '#3F51B5',
    secondary: '#5C6BC0',
  },
  electric: {
    id: 'electric',
    name: 'Electric Blue',
    background: '#E1F5FE',
    text: '#01579B',
    accent: '#00B0FF',
    secondary: '#40C4FF',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan Splash',
    background: '#E0F7FA',
    text: '#006064',
    accent: '#00BCD4',
    secondary: '#26C6DA',
  },
  teal: {
    id: 'teal',
    name: 'Teal Wave',
    background: '#E0F2F1',
    text: '#004D40',
    accent: '#00897B',
    secondary: '#26A69A',
  },
  
  // Vibrant Greens
  lime: {
    id: 'lime',
    name: 'Lime Zest',
    background: '#F1F8E9',
    text: '#33691E',
    accent: '#7CB342',
    secondary: '#9CCC65',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    background: '#E8F5E9',
    text: '#1B5E20',
    accent: '#43A047',
    secondary: '#66BB6A',
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle Green',
    background: '#E0F2E9',
    text: '#145A32',
    accent: '#27AE60',
    secondary: '#2ECC71',
  },
  
  // Vibrant Pinks/Purples
  hotpink: {
    id: 'hotpink',
    name: 'Hot Pink',
    background: '#FCE4EC',
    text: '#880E4F',
    accent: '#E91E63',
    secondary: '#F06292',
  },
  magenta: {
    id: 'magenta',
    name: 'Magenta',
    background: '#F3E5F5',
    text: '#7B1FA2',
    accent: '#AB47BC',
    secondary: '#CE93D8',
  },
  violet: {
    id: 'violet',
    name: 'Vivid Violet',
    background: '#EDE7F6',
    text: '#4527A0',
    accent: '#7C4DFF',
    secondary: '#B388FF',
  },
  grape: {
    id: 'grape',
    name: 'Grape',
    background: '#F3E5F5',
    text: '#4A148C',
    accent: '#9C27B0',
    secondary: '#BA68C8',
  },
  
  // Rainbow Brights
  rainbow_red: {
    id: 'rainbow_red',
    name: 'Candy Red',
    background: '#FFEBEE',
    text: '#B71C1C',
    accent: '#F44336',
    secondary: '#E57373',
  },
  rainbow_orange: {
    id: 'rainbow_orange',
    name: 'Pumpkin',
    background: '#FBE9E7',
    text: '#BF360C',
    accent: '#FF5722',
    secondary: '#FF8A65',
  },
  rainbow_yellow: {
    id: 'rainbow_yellow',
    name: 'Lemon',
    background: '#FFFDE7',
    text: '#F57F17',
    accent: '#FFEB3B',
    secondary: '#FFF176',
  },
  rainbow_green: {
    id: 'rainbow_green',
    name: 'Grass',
    background: '#E8F5E9',
    text: '#2E7D32',
    accent: '#4CAF50',
    secondary: '#81C784',
  },
  rainbow_blue: {
    id: 'rainbow_blue',
    name: 'Sky',
    background: '#E3F2FD',
    text: '#1565C0',
    accent: '#2196F3',
    secondary: '#64B5F6',
  },
  rainbow_purple: {
    id: 'rainbow_purple',
    name: 'Amethyst',
    background: '#EDE7F6',
    text: '#6A1B9A',
    accent: '#9C27B0',
    secondary: '#BA68C8',
  },
  
  // Dark/Night themes
  night: {
    id: 'night',
    name: 'Starry Night',
    background: '#1A1A2E',
    text: '#EAEAEA',
    accent: '#9D4EDD',
    secondary: '#7B2CBF',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    background: '#0D1B2A',
    text: '#E0E1DD',
    accent: '#3D5A80',
    secondary: '#98C1D9',
  },
  noir: {
    id: 'noir',
    name: 'Noir',
    background: '#121212',
    text: '#FFFFFF',
    accent: '#BB86FC',
    secondary: '#03DAC6',
  },
};

// Text position presets
export const TEXT_POSITIONS = {
  bottom: { id: 'bottom', name: 'Bottom', region: { x: 0.05, y: 0.7, width: 0.9, height: 0.25 } },
  top: { id: 'top', name: 'Top', region: { x: 0.05, y: 0.05, width: 0.9, height: 0.25 } },
  left: { id: 'left', name: 'Left Side', region: { x: 0.05, y: 0.1, width: 0.35, height: 0.8 } },
  right: { id: 'right', name: 'Right Side', region: { x: 0.6, y: 0.1, width: 0.35, height: 0.8 } },
  overlay: { id: 'overlay', name: 'Over Image', region: { x: 0.1, y: 0.75, width: 0.8, height: 0.2 } },
  split: { id: 'split', name: 'Split View', region: { x: 0.52, y: 0.1, width: 0.43, height: 0.8 } },
};

// Image position presets
export const IMAGE_POSITIONS = {
  full: { id: 'full', name: 'Full Page', region: { x: 0, y: 0, width: 1, height: 1 } },
  top: { id: 'top', name: 'Top Half', region: { x: 0.05, y: 0.05, width: 0.9, height: 0.55 } },
  center: { id: 'center', name: 'Center', region: { x: 0.15, y: 0.1, width: 0.7, height: 0.55 } },
  left: { id: 'left', name: 'Left Half', region: { x: 0.05, y: 0.05, width: 0.45, height: 0.9 } },
  right: { id: 'right', name: 'Right Half', region: { x: 0.5, y: 0.05, width: 0.45, height: 0.9 } },
  small: { id: 'small', name: 'Small Center', region: { x: 0.25, y: 0.15, width: 0.5, height: 0.45 } },
  inset: { id: 'inset', name: 'Inset', region: { x: 0.1, y: 0.1, width: 0.8, height: 0.5 } },
};

/**
 * TEMPLATE DEFINITIONS
 * Each template is a complete page layout configuration
 */
export const TEMPLATES = {
  // =============================================
  // CLASSIC TEMPLATES
  // =============================================
  'classic-bottom': {
    id: 'classic-bottom',
    name: 'Classic Storybook',
    description: 'Traditional layout with image on top, text at bottom',
    category: 'classic',
    preview: '📖',
    layout: {
      image: {
        position: IMAGE_POSITIONS.top,
        frame: 'rounded',
        padding: 0.03,
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'top',
      },
    },
    typography: {
      fontFamily: 'Merriweather',
      baseFontSize: 18,
      lineHeight: 1.6,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.cream,
    effects: {
      pageShadow: true,
      imageDropShadow: true,
    },
  },

  'classic-framed': {
    id: 'classic-framed',
    name: 'Elegant Frame',
    description: 'Centered image with decorative frame, text below',
    category: 'classic',
    preview: '🖼️',
    layout: {
      image: {
        position: IMAGE_POSITIONS.center,
        frame: 'scallop',
        padding: 0.04,
        border: { width: 3, color: 'accent' },
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'center',
      },
    },
    typography: {
      fontFamily: 'Playfair Display',
      baseFontSize: 20,
      lineHeight: 1.7,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.lavender,
    effects: {
      pageShadow: true,
      imageDropShadow: true,
      decorativeBorder: true,
    },
  },

  // =============================================
  // PLAYFUL TEMPLATES
  // =============================================
  'playful-cloud': {
    id: 'playful-cloud',
    name: 'Dreamy Cloud',
    description: 'Fun cloud-shaped frame with playful typography',
    category: 'playful',
    preview: '☁️',
    layout: {
      image: {
        position: IMAGE_POSITIONS.center,
        frame: 'cloud',
        padding: 0.02,
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'center',
      },
    },
    typography: {
      fontFamily: 'Bubblegum Sans',
      baseFontSize: 22,
      lineHeight: 1.5,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.cool,
    effects: {
      pageShadow: false,
      imageDropShadow: true,
    },
  },

  'playful-star': {
    id: 'playful-star',
    name: 'Superstar',
    description: 'Star-shaped image frame with bold colors',
    category: 'playful',
    preview: '⭐',
    layout: {
      image: {
        position: { ...IMAGE_POSITIONS.center, region: { x: 0.2, y: 0.08, width: 0.6, height: 0.55 } },
        frame: 'star',
        padding: 0.02,
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'top',
      },
    },
    typography: {
      fontFamily: 'Fredoka One',
      baseFontSize: 22,
      lineHeight: 1.5,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.candy,
    effects: {
      pageShadow: false,
      imageDropShadow: true,
    },
  },

  'playful-blob': {
    id: 'playful-blob',
    name: 'Organic Fun',
    description: 'Organic blob shape with whimsical feel',
    category: 'playful',
    preview: '🫧',
    layout: {
      image: {
        position: IMAGE_POSITIONS.center,
        frame: 'blob',
        padding: 0.03,
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'center',
      },
    },
    typography: {
      fontFamily: 'Comic Neue',
      baseFontSize: 20,
      lineHeight: 1.6,
      fontWeight: '700',
    },
    colors: COLOR_THEMES.forest,
    effects: {
      pageShadow: false,
      imageDropShadow: true,
    },
  },

  // =============================================
  // MODERN TEMPLATES
  // =============================================
  'modern-split': {
    id: 'modern-split',
    name: 'Modern Split',
    description: 'Clean side-by-side layout with image left, text right',
    category: 'modern',
    preview: '◧',
    layout: {
      image: {
        position: IMAGE_POSITIONS.left,
        frame: 'rectangle',
        padding: 0,
      },
      text: {
        position: TEXT_POSITIONS.split,
        align: 'left',
        verticalAlign: 'center',
      },
    },
    typography: {
      fontFamily: 'Poppins',
      baseFontSize: 18,
      lineHeight: 1.7,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.cream,
    effects: {
      pageShadow: false,
      imageDropShadow: false,
    },
  },

  'modern-full': {
    id: 'modern-full',
    name: 'Full Bleed',
    description: 'Full-page image with text overlay',
    category: 'modern',
    preview: '🖼',
    layout: {
      image: {
        position: IMAGE_POSITIONS.full,
        frame: 'rectangle',
        padding: 0,
      },
      text: {
        position: TEXT_POSITIONS.overlay,
        align: 'center',
        verticalAlign: 'center',
        background: 'rgba(255,255,255,0.9)',
        borderRadius: 12,
        padding: { x: 0.04, y: 0.02 },
      },
    },
    typography: {
      fontFamily: 'Quicksand',
      baseFontSize: 18,
      lineHeight: 1.6,
      fontWeight: '600',
    },
    colors: { ...COLOR_THEMES.cream, background: 'transparent' },
    effects: {
      pageShadow: false,
      imageDropShadow: false,
      textShadow: true,
    },
  },

  'modern-minimal': {
    id: 'modern-minimal',
    name: 'Minimal',
    description: 'Clean, minimal layout with generous whitespace',
    category: 'modern',
    preview: '◻️',
    layout: {
      image: {
        position: IMAGE_POSITIONS.small,
        frame: 'rounded',
        padding: 0.02,
      },
      text: {
        position: { ...TEXT_POSITIONS.bottom, region: { x: 0.15, y: 0.65, width: 0.7, height: 0.3 } },
        align: 'center',
        verticalAlign: 'top',
      },
    },
    typography: {
      fontFamily: 'Raleway',
      baseFontSize: 17,
      lineHeight: 1.8,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.cream,
    effects: {
      pageShadow: false,
      imageDropShadow: true,
    },
  },

  // =============================================
  // SPECIAL TEMPLATES
  // =============================================
  'special-heart': {
    id: 'special-heart',
    name: 'With Love',
    description: 'Heart-shaped frame for sweet moments',
    category: 'special',
    preview: '💝',
    layout: {
      image: {
        position: { ...IMAGE_POSITIONS.center, region: { x: 0.2, y: 0.08, width: 0.6, height: 0.55 } },
        frame: 'heart',
        padding: 0.02,
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'center',
      },
    },
    typography: {
      fontFamily: 'Caveat',
      baseFontSize: 26,
      lineHeight: 1.4,
      fontWeight: '600',
    },
    colors: COLOR_THEMES.candy,
    effects: {
      pageShadow: false,
      imageDropShadow: true,
    },
  },

  'special-arch': {
    id: 'special-arch',
    name: 'Grand Arch',
    description: 'Elegant arch frame for magical scenes',
    category: 'special',
    preview: '🚪',
    layout: {
      image: {
        position: { ...IMAGE_POSITIONS.center, region: { x: 0.15, y: 0.05, width: 0.7, height: 0.6 } },
        frame: 'arch',
        padding: 0.02,
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'center',
      },
    },
    typography: {
      fontFamily: 'Libre Baskerville',
      baseFontSize: 18,
      lineHeight: 1.7,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.sunset,
    effects: {
      pageShadow: true,
      imageDropShadow: true,
    },
  },

  'special-night': {
    id: 'special-night',
    name: 'Night Sky',
    description: 'Dark theme for bedtime stories',
    category: 'special',
    preview: '🌙',
    layout: {
      image: {
        position: IMAGE_POSITIONS.top,
        frame: 'oval',
        padding: 0.03,
      },
      text: {
        position: TEXT_POSITIONS.bottom,
        align: 'center',
        verticalAlign: 'center',
      },
    },
    typography: {
      fontFamily: 'Kalam',
      baseFontSize: 20,
      lineHeight: 1.6,
      fontWeight: '400',
    },
    colors: COLOR_THEMES.night,
    effects: {
      pageShadow: false,
      imageDropShadow: true,
      glowEffect: true,
    },
  },
};

// Get templates by category
export function getTemplatesByCategory(category) {
  return Object.values(TEMPLATES).filter(t => t.category === category);
}

// Get all template categories
export function getCategories() {
  const categories = new Set(Object.values(TEMPLATES).map(t => t.category));
  return Array.from(categories);
}

// Get a template by ID
export function getTemplate(id) {
  return TEMPLATES[id] || TEMPLATES['classic-bottom'];
}

// Get all templates as array
export function getAllTemplates() {
  return Object.values(TEMPLATES);
}

// Clone a template with overrides
export function customizeTemplate(templateId, overrides = {}) {
  const base = getTemplate(templateId);
  return deepMerge(base, overrides);
}

// Deep merge helper
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}