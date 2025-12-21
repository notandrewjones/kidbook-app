// js/compositor/templates.js
// Template definitions and schema for book page layouts
// KID-FRIENDLY EDITION - Bubbly, decorative, whimsical templates!

// Available frame shapes - KID-FRIENDLY shapes
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
  superRounded: {
    id: 'superRounded',
    name: 'Super Rounded',
    svg: (width, height) => `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.2}" ry="${Math.min(width, height) * 0.2}"/>`,
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
    name: 'Fluffy Cloud',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w*0.15} ${h*0.7} Q ${w*0.02} ${h*0.7} ${w*0.02} ${h*0.52} Q ${w*0.02} ${h*0.32} ${w*0.18} ${h*0.28} Q ${w*0.12} ${h*0.12} ${w*0.32} ${h*0.12} Q ${w*0.42} ${h*0.02} ${w*0.58} ${h*0.1} Q ${w*0.78} ${h*0.05} ${w*0.85} ${h*0.28} Q ${w*0.98} ${h*0.32} ${w*0.98} ${h*0.52} Q ${w*0.98} ${h*0.72} ${w*0.82} ${h*0.76} Q ${w*0.78} ${h*0.9} ${w*0.58} ${h*0.88} Q ${w*0.42} ${h*0.95} ${w*0.28} ${h*0.85} Q ${w*0.15} ${h*0.88} ${w*0.15} ${h*0.7} Z"/>`;
    },
  },
  bubble: {
    id: 'bubble',
    name: 'Bubbly',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w*0.5} ${h*0.02} Q ${w*0.82} ${h*0.02} ${w*0.95} ${h*0.25} Q ${w*1.02} ${h*0.5} ${w*0.92} ${h*0.75} Q ${w*0.8} ${h*0.98} ${w*0.5} ${h*0.98} Q ${w*0.2} ${h*0.98} ${w*0.08} ${h*0.75} Q ${w*-0.02} ${h*0.5} ${w*0.05} ${h*0.25} Q ${w*0.18} ${h*0.02} ${w*0.5} ${h*0.02} Z"/>`;
    },
  },
  heart: {
    id: 'heart',
    name: 'Heart',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w*0.5} ${h*0.88} C ${w*0.12} ${h*0.58} ${w*0.02} ${h*0.35} ${w*0.22} ${h*0.18} C ${w*0.38} ${h*0.06} ${w*0.5} ${h*0.2} ${w*0.5} ${h*0.28} C ${w*0.5} ${h*0.2} ${w*0.62} ${h*0.06} ${w*0.78} ${h*0.18} C ${w*0.98} ${h*0.35} ${w*0.88} ${h*0.58} ${w*0.5} ${h*0.88} Z"/>`;
    },
  },
  star: {
    id: 'star',
    name: 'Sparkle Star',
    svg: (width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2;
      const innerR = outerR * 0.45;
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
  scallop: {
    id: 'scallop',
    name: 'Scalloped',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const scallops = 10;
      const scW = w / scallops;
      const scH = h / scallops;
      const depth = 0.08;
      let path = `M ${w * depth} ${h * depth}`;
      for (let i = 0; i < scallops; i++) {
        const x1 = w * depth + i * scW + scW * 0.5;
        const x2 = w * depth + (i + 1) * scW;
        if (x2 <= w - w * depth) path += ` Q ${x1} 0 ${Math.min(x2, w - w * depth)} ${h * depth}`;
      }
      path += ` L ${w - w * depth} ${h * depth}`;
      for (let i = 0; i < scallops; i++) {
        const y1 = h * depth + i * scH + scH * 0.5;
        const y2 = h * depth + (i + 1) * scH;
        if (y2 <= h - h * depth) path += ` Q ${w} ${y1} ${w - w * depth} ${Math.min(y2, h - h * depth)}`;
      }
      path += ` L ${w - w * depth} ${h - h * depth}`;
      for (let i = scallops - 1; i >= 0; i--) {
        const x1 = w * depth + i * scW + scW * 0.5;
        const x2 = w * depth + i * scW;
        if (x2 >= w * depth) path += ` Q ${x1} ${h} ${Math.max(x2, w * depth)} ${h - h * depth}`;
      }
      path += ` L ${w * depth} ${h - h * depth}`;
      for (let i = scallops - 1; i >= 0; i--) {
        const y1 = h * depth + i * scH + scH * 0.5;
        const y2 = h * depth + i * scH;
        if (y2 >= h * depth) path += ` Q 0 ${y1} ${w * depth} ${Math.max(y2, h * depth)}`;
      }
      path += ' Z';
      return `<path d="${path}"/>`;
    },
  },
  blob: {
    id: 'blob',
    name: 'Friendly Blob',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w*0.5} ${h*0.03} Q ${w*0.88} ${h*0.05} ${w*0.95} ${h*0.38} Q ${w*1.0} ${h*0.62} ${w*0.85} ${h*0.85} Q ${w*0.68} ${h*1.0} ${w*0.42} ${h*0.95} Q ${w*0.1} ${h*0.9} ${w*0.05} ${h*0.6} Q ${w*0.0} ${h*0.3} ${w*0.2} ${h*0.1} Q ${w*0.35} ${h*0.0} ${w*0.5} ${h*0.03} Z"/>`;
    },
  },
  wavy: {
    id: 'wavy',
    name: 'Wavy Frame',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const waves = 4;
      const waveDepth = 0.05;
      let path = `M 0 ${h * waveDepth}`;
      for (let i = 0; i < waves; i++) {
        const x1 = (i + 0.5) * (w / waves);
        const x2 = (i + 1) * (w / waves);
        path += ` Q ${x1} ${i % 2 === 0 ? 0 : h * waveDepth * 2} ${x2} ${h * waveDepth}`;
      }
      path += ` L ${w} ${h - h * waveDepth}`;
      for (let i = waves - 1; i >= 0; i--) {
        const x1 = (i + 0.5) * (w / waves);
        const x2 = i * (w / waves);
        path += ` Q ${x1} ${i % 2 === 0 ? h : h - h * waveDepth * 2} ${x2} ${h - h * waveDepth}`;
      }
      path += ' Z';
      return `<path d="${path}"/>`;
    },
  },
  stamp: {
    id: 'stamp',
    name: 'Postage Stamp',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const notches = 12;
      const notchSize = Math.min(w, h) * 0.025;
      const margin = notchSize * 2;
      let path = `M ${margin} ${margin}`;
      for (let i = 0; i < notches; i++) {
        const x = margin + (i + 0.5) * ((w - margin * 2) / notches);
        path += ` L ${x - notchSize} ${margin} A ${notchSize} ${notchSize} 0 1 1 ${x + notchSize} ${margin}`;
      }
      path += ` L ${w - margin} ${margin}`;
      for (let i = 0; i < notches; i++) {
        const y = margin + (i + 0.5) * ((h - margin * 2) / notches);
        path += ` L ${w - margin} ${y - notchSize} A ${notchSize} ${notchSize} 0 1 1 ${w - margin} ${y + notchSize}`;
      }
      path += ` L ${w - margin} ${h - margin}`;
      for (let i = notches - 1; i >= 0; i--) {
        const x = margin + (i + 0.5) * ((w - margin * 2) / notches);
        path += ` L ${x + notchSize} ${h - margin} A ${notchSize} ${notchSize} 0 1 1 ${x - notchSize} ${h - margin}`;
      }
      path += ` L ${margin} ${h - margin}`;
      for (let i = notches - 1; i >= 0; i--) {
        const y = margin + (i + 0.5) * ((h - margin * 2) / notches);
        path += ` L ${margin} ${y + notchSize} A ${notchSize} ${notchSize} 0 1 1 ${margin} ${y - notchSize}`;
      }
      path += ' Z';
      return `<path d="${path}"/>`;
    },
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w * 0.5} ${h * 0.02} L ${w * 0.95} ${h * 0.12} L ${w * 0.95} ${h * 0.5} Q ${w * 0.95} ${h * 0.75} ${w * 0.5} ${h * 0.98} Q ${w * 0.05} ${h * 0.75} ${w * 0.05} ${h * 0.5} L ${w * 0.05} ${h * 0.12} Z"/>`;
    },
  },
};

// Available font families - KID-FRIENDLY fonts
export const FONT_FAMILIES = {
  'Fredoka One': { category: 'playful', weight: '400', googleFont: true },
  'Bubblegum Sans': { category: 'playful', weight: '400', googleFont: true },
  'Baloo 2': { category: 'playful', weight: '400,600,700,800', googleFont: true },
  'Chewy': { category: 'playful', weight: '400', googleFont: true },
  'Luckiest Guy': { category: 'playful', weight: '400', googleFont: true },
  'Sniglet': { category: 'playful', weight: '400,800', googleFont: true },
  'Patrick Hand': { category: 'handwritten', weight: '400', googleFont: true },
  'Comic Neue': { category: 'handwritten', weight: '400,700', googleFont: true },
  'Caveat': { category: 'handwritten', weight: '400,600,700', googleFont: true },
  'Kalam': { category: 'handwritten', weight: '400,700', googleFont: true },
  'Schoolbell': { category: 'handwritten', weight: '400', googleFont: true },
  'Quicksand': { category: 'storybook', weight: '400,500,600,700', googleFont: true },
  'Nunito': { category: 'storybook', weight: '400,600,700,800', googleFont: true },
  'Varela Round': { category: 'storybook', weight: '400', googleFont: true },
  'ABeeZee': { category: 'storybook', weight: '400', googleFont: true },
  'Poppins': { category: 'storybook', weight: '400,500,600,700', googleFont: true },
};

// Color themes - VIBRANT KID-FRIENDLY palettes
export const COLOR_THEMES = {
  sunshine: { id: 'sunshine', name: 'Sunshine', background: '#FFF9E6', text: '#4A3728', accent: '#FFB830', secondary: '#FF6B35', highlight: '#FFEB99' },
  bubblegum: { id: 'bubblegum', name: 'Bubblegum', background: '#FFF0F5', text: '#5D3A4A', accent: '#FF69B4', secondary: '#FFB6C1', highlight: '#FF1493' },
  oceanSplash: { id: 'oceanSplash', name: 'Ocean Splash', background: '#E8F8FF', text: '#1A3A4A', accent: '#00BFFF', secondary: '#40E0D0', highlight: '#87CEEB' },
  mintFresh: { id: 'mintFresh', name: 'Mint Fresh', background: '#F0FFF4', text: '#2D4A3E', accent: '#3CB371', secondary: '#98FB98', highlight: '#00FA9A' },
  lavenderDream: { id: 'lavenderDream', name: 'Lavender Dream', background: '#F8F0FF', text: '#4A3260', accent: '#9370DB', secondary: '#DDA0DD', highlight: '#E6E6FA' },
  candyShop: { id: 'candyShop', name: 'Candy Shop', background: '#FFF5F8', text: '#4A2840', accent: '#FF6B9D', secondary: '#C77DFF', highlight: '#FFD93D' },
  jungleFun: { id: 'jungleFun', name: 'Jungle Fun', background: '#F0FFE8', text: '#2A4020', accent: '#32CD32', secondary: '#9ACD32', highlight: '#ADFF2F' },
  berryBlast: { id: 'berryBlast', name: 'Berry Blast', background: '#FFF0FF', text: '#4A1A4A', accent: '#DA70D6', secondary: '#FF6EB4', highlight: '#FF00FF' },
  cloudySky: { id: 'cloudySky', name: 'Cloudy Sky', background: '#F5F9FF', text: '#3A4A5A', accent: '#6CA0DC', secondary: '#B0C4DE', highlight: '#ADD8E6' },
  peachyKeen: { id: 'peachyKeen', name: 'Peachy Keen', background: '#FFF8F0', text: '#5A4030', accent: '#FFAB76', secondary: '#FFD4A3', highlight: '#FFDAB9' },
  cottonCandy: { id: 'cottonCandy', name: 'Cotton Candy', background: '#FFF5FA', text: '#5A3050', accent: '#FFB3D9', secondary: '#B3E0FF', highlight: '#E0B3FF' },
  lemonDrop: { id: 'lemonDrop', name: 'Lemon Drop', background: '#FFFEF0', text: '#4A4520', accent: '#FFE135', secondary: '#FFFD82', highlight: '#FFF44F' },
  superHero: { id: 'superHero', name: 'Super Hero', background: '#F0F4FF', text: '#1A2040', accent: '#4169E1', secondary: '#FF4500', highlight: '#FFD700' },
  dinosaurDen: { id: 'dinosaurDen', name: 'Dinosaur Den', background: '#F5FFF0', text: '#2A3A20', accent: '#228B22', secondary: '#8B4513', highlight: '#FF8C00' },
  spaceExplorer: { id: 'spaceExplorer', name: 'Space Explorer', background: '#0D1B2A', text: '#E0E1DD', accent: '#7B68EE', secondary: '#00CED1', highlight: '#FFD700' },
  pirateAdventure: { id: 'pirateAdventure', name: 'Pirate Adventure', background: '#FFF8E8', text: '#3A2A1A', accent: '#CD853F', secondary: '#4682B4', highlight: '#FFD700' },
  unicornMagic: { id: 'unicornMagic', name: 'Unicorn Magic', background: '#FFF8FF', text: '#4A3050', accent: '#FF6FD8', secondary: '#A855F7', highlight: '#FDE047' },
  fairyGarden: { id: 'fairyGarden', name: 'Fairy Garden', background: '#F8FFF8', text: '#2A4A3A', accent: '#9AE6B4', secondary: '#F687B3', highlight: '#FBBF24' },
  mermaidCove: { id: 'mermaidCove', name: 'Mermaid Cove', background: '#F0FFFF', text: '#1A4040', accent: '#00CED1', secondary: '#9370DB', highlight: '#FF69B4' },
  rainbowBright: { id: 'rainbowBright', name: 'Rainbow Bright', background: '#FFFEF5', text: '#3A3A3A', accent: '#FF6B6B', secondary: '#4ECDC4', highlight: '#FFE66D' },
  sleepyMoon: { id: 'sleepyMoon', name: 'Sleepy Moon', background: '#1A1A2E', text: '#E8E8F0', accent: '#FFE4B5', secondary: '#6B5B95', highlight: '#C9B1FF' },
  starryNight: { id: 'starryNight', name: 'Starry Night', background: '#0F0F1A', text: '#F0F0FF', accent: '#FFD700', secondary: '#4169E1', highlight: '#87CEEB' },
  cozyBear: { id: 'cozyBear', name: 'Cozy Bear', background: '#FFF5EB', text: '#4A3828', accent: '#D2691E', secondary: '#F4A460', highlight: '#FFE4C4' },
};

// Text position presets
export const TEXT_POSITIONS = {
  bottom: { id: 'bottom', name: 'Bottom', region: { x: 0.05, y: 0.72, width: 0.9, height: 0.23 } },
  bottomWide: { id: 'bottomWide', name: 'Bottom Wide', region: { x: 0.08, y: 0.75, width: 0.84, height: 0.2 } },
  top: { id: 'top', name: 'Top', region: { x: 0.05, y: 0.05, width: 0.9, height: 0.2 } },
  overlay: { id: 'overlay', name: 'Over Image', region: { x: 0.1, y: 0.78, width: 0.8, height: 0.18 } },
  split: { id: 'split', name: 'Split View', region: { x: 0.52, y: 0.1, width: 0.43, height: 0.8 } },
  centered: { id: 'centered', name: 'Centered', region: { x: 0.15, y: 0.7, width: 0.7, height: 0.25 } },
};

// Image position presets
export const IMAGE_POSITIONS = {
  full: { id: 'full', name: 'Full Page', region: { x: 0, y: 0, width: 1, height: 1 } },
  top: { id: 'top', name: 'Top', region: { x: 0.08, y: 0.05, width: 0.84, height: 0.58 } },
  topLarge: { id: 'topLarge', name: 'Top Large', region: { x: 0.05, y: 0.03, width: 0.9, height: 0.65 } },
  center: { id: 'center', name: 'Center', region: { x: 0.12, y: 0.1, width: 0.76, height: 0.55 } },
  left: { id: 'left', name: 'Left Half', region: { x: 0.05, y: 0.05, width: 0.45, height: 0.85 } },
  inset: { id: 'inset', name: 'Inset', region: { x: 0.1, y: 0.08, width: 0.8, height: 0.55 } },
};

// TEMPLATE DEFINITIONS - KID-FRIENDLY EDITION
export const TEMPLATES = {
  // WHIMSICAL TEMPLATES
  'bubble-dream': {
    id: 'bubble-dream', name: 'Bubble Dream', description: 'Soft bubbly frame with bouncy text', category: 'whimsical', preview: '🫧',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'bubble', padding: 0.03, border: { width: 6, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Baloo 2', baseFontSize: 24, lineHeight: 1.5, fontWeight: '600' },
    colors: COLOR_THEMES.bubblegum,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'fluffy-cloud': {
    id: 'fluffy-cloud', name: 'Fluffy Cloud', description: 'Dreamy cloud frame floating on the page', category: 'whimsical', preview: '☁️',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.1, y: 0.05, width: 0.8, height: 0.58 } }, frame: 'cloud', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Bubblegum Sans', baseFontSize: 26, lineHeight: 1.4, fontWeight: '400' },
    colors: COLOR_THEMES.cloudySky,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'rainbow-scallop': {
    id: 'rainbow-scallop', name: 'Rainbow Scallop', description: 'Scalloped edge frame with rainbow vibes', category: 'whimsical', preview: '🌈',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'scallop', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Fredoka One', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.rainbowBright,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'wavy-fun': {
    id: 'wavy-fun', name: 'Wavy Fun', description: 'Playful wavy borders that wiggle', category: 'whimsical', preview: '〰️',
    layout: { image: { position: IMAGE_POSITIONS.topLarge, frame: 'wavy', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'top' } },
    typography: { fontFamily: 'Comic Neue', baseFontSize: 22, lineHeight: 1.6, fontWeight: '700' },
    colors: COLOR_THEMES.sunshine,
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // ADVENTURE TEMPLATES
  'superhero-shield': {
    id: 'superhero-shield', name: 'Hero Shield', description: 'Bold shield frame for heroic tales', category: 'adventure', preview: '🛡️',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.18, y: 0.05, width: 0.64, height: 0.58 } }, frame: 'shield', padding: 0.02, border: { width: 6, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Luckiest Guy', baseFontSize: 26, lineHeight: 1.4, fontWeight: '400' },
    colors: COLOR_THEMES.superHero,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'ticket-adventure': {
    id: 'ticket-adventure', name: 'Adventure Ticket', description: 'Ticket-shaped frame for exciting journeys', category: 'adventure', preview: '🎟️',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'stamp', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Chewy', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.pirateAdventure,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'star-explorer': {
    id: 'star-explorer', name: 'Star Explorer', description: 'Sparkly star frame for stellar stories', category: 'adventure', preview: '⭐',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.15, y: 0.05, width: 0.7, height: 0.58 } }, frame: 'star', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'top' } },
    typography: { fontFamily: 'Fredoka One', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.spaceExplorer,
    effects: { pageShadow: false, imageDropShadow: true, glowEffect: true },
  },
  'dino-stomp': {
    id: 'dino-stomp', name: 'Dino Stomp', description: 'Bold blob frame for dinosaur adventures', category: 'adventure', preview: '🦕',
    layout: { image: { position: IMAGE_POSITIONS.topLarge, frame: 'blob', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Sniglet', baseFontSize: 24, lineHeight: 1.5, fontWeight: '800' },
    colors: COLOR_THEMES.dinosaurDen,
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // MAGICAL TEMPLATES
  'unicorn-sparkle': {
    id: 'unicorn-sparkle', name: 'Unicorn Sparkle', description: 'Magical heart frame with rainbow colors', category: 'magical', preview: '🦄',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.18, y: 0.05, width: 0.64, height: 0.58 } }, frame: 'heart', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Baloo 2', baseFontSize: 24, lineHeight: 1.5, fontWeight: '600' },
    colors: COLOR_THEMES.unicornMagic,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'mermaid-bubble': {
    id: 'mermaid-bubble', name: 'Mermaid Bubble', description: 'Ocean bubble frame for underwater magic', category: 'magical', preview: '🧜‍♀️',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'oval', padding: 0.03, border: { width: 6, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Quicksand', baseFontSize: 22, lineHeight: 1.6, fontWeight: '600' },
    colors: COLOR_THEMES.mermaidCove,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'starry-wish': {
    id: 'starry-wish', name: 'Starry Wish', description: 'Dreamy night sky with twinkling stars', category: 'magical', preview: '✨',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'superRounded', padding: 0.03, border: { width: 4, color: 'highlight' } }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Caveat', baseFontSize: 30, lineHeight: 1.4, fontWeight: '600' },
    colors: COLOR_THEMES.starryNight,
    effects: { pageShadow: false, imageDropShadow: true, glowEffect: true },
  },
  'fairy-garden': {
    id: 'fairy-garden', name: 'Fairy Garden', description: 'Enchanted garden frame for magical moments', category: 'magical', preview: '🌸',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'scallop', padding: 0.02, border: { width: 4, color: 'secondary' } }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Patrick Hand', baseFontSize: 26, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.fairyGarden,
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // COZY TEMPLATES
  'sleepy-moon': {
    id: 'sleepy-moon', name: 'Sleepy Moon', description: 'Soft oval frame for bedtime stories', category: 'cozy', preview: '🌙',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'oval', padding: 0.03, border: { width: 4, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Kalam', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.sleepyMoon,
    effects: { pageShadow: false, imageDropShadow: true, glowEffect: true },
  },
  'stamp-collection': {
    id: 'stamp-collection', name: 'Stamp Collection', description: 'Vintage stamp frame for treasured memories', category: 'cozy', preview: '📮',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'stamp', padding: 0.02 }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Schoolbell', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.peachyKeen,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'cotton-candy': {
    id: 'cotton-candy', name: 'Cotton Candy', description: 'Soft and sweet cloud frame', category: 'cozy', preview: '🍭',
    layout: { image: { position: IMAGE_POSITIONS.topLarge, frame: 'cloud', padding: 0.02, border: { width: 4, color: 'secondary' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Varela Round', baseFontSize: 22, lineHeight: 1.6, fontWeight: '400' },
    colors: COLOR_THEMES.cottonCandy,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'cozy-bear': {
    id: 'cozy-bear', name: 'Cozy Bear', description: 'Warm rounded frame for cuddly stories', category: 'cozy', preview: '🧸',
    layout: { image: { position: IMAGE_POSITIONS.inset, frame: 'superRounded', padding: 0.03, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Nunito', baseFontSize: 22, lineHeight: 1.6, fontWeight: '600' },
    colors: COLOR_THEMES.cozyBear,
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // STORYBOOK CLASSICS (but still kid-friendly)
  'storybook-classic': {
    id: 'storybook-classic', name: 'Classic Storybook', description: 'Traditional rounded frame with warm colors', category: 'storybook', preview: '📚',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'superRounded', padding: 0.03, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'top' } },
    typography: { fontFamily: 'Quicksand', baseFontSize: 22, lineHeight: 1.6, fontWeight: '500' },
    colors: COLOR_THEMES.sunshine,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'picture-perfect': {
    id: 'picture-perfect', name: 'Picture Perfect', description: 'Simple rounded frame that lets the art shine', category: 'storybook', preview: '🖼️',
    layout: { image: { position: IMAGE_POSITIONS.inset, frame: 'rounded', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'ABeeZee', baseFontSize: 20, lineHeight: 1.7, fontWeight: '400' },
    colors: COLOR_THEMES.mintFresh,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'side-by-side': {
    id: 'side-by-side', name: 'Side by Side', description: 'Image on left, text on right for longer stories', category: 'storybook', preview: '📖',
    layout: { image: { position: IMAGE_POSITIONS.left, frame: 'superRounded', padding: 0.02 }, text: { position: TEXT_POSITIONS.split, align: 'left', verticalAlign: 'center' } },
    typography: { fontFamily: 'Nunito', baseFontSize: 20, lineHeight: 1.7, fontWeight: '400' },
    colors: COLOR_THEMES.lavenderDream,
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'full-page-magic': {
    id: 'full-page-magic', name: 'Full Page Magic', description: 'Big beautiful image with text overlay', category: 'storybook', preview: '✨',
    layout: { image: { position: IMAGE_POSITIONS.full, frame: 'rectangle', padding: 0 }, text: { position: TEXT_POSITIONS.overlay, align: 'center', verticalAlign: 'center', background: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: { x: 0.05, y: 0.02 } } },
    typography: { fontFamily: 'Poppins', baseFontSize: 20, lineHeight: 1.6, fontWeight: '500' },
    colors: { ...COLOR_THEMES.rainbowBright, background: 'transparent' },
    effects: { pageShadow: false, imageDropShadow: false },
  },
};

// Helper functions
export function getTemplatesByCategory(category) {
  return Object.values(TEMPLATES).filter(t => t.category === category);
}

export function getCategories() {
  const categories = new Set(Object.values(TEMPLATES).map(t => t.category));
  return Array.from(categories);
}

export function getTemplate(id) {
  return TEMPLATES[id] || TEMPLATES['bubble-dream'];
}

export function getAllTemplates() {
  return Object.values(TEMPLATES);
}

export function customizeTemplate(templateId, overrides = {}) {
  const base = getTemplate(templateId);
  return deepMerge(base, overrides);
}

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