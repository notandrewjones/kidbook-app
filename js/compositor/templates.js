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
  pillShape: {
    id: 'pillShape',
    name: 'Pill Shape',
    svg: (width, height) => `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.5}" ry="${Math.min(width, height) * 0.5}"/>`,
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
  chunkyStar: {
    id: 'chunkyStar',
    name: 'Chunky Star',
    svg: (width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2;
      const innerR = outerR * 0.65; // Much thicker - was 0.45
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
      const depth = 0.06;
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
  wobble: {
    id: 'wobble',
    name: 'Wobbly',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w*0.08} ${h*0.15} Q ${w*0.25} ${h*0.02} ${w*0.5} ${h*0.05} Q ${w*0.75} ${h*0.02} ${w*0.92} ${h*0.15} Q ${w*1.0} ${h*0.4} ${w*0.95} ${h*0.6} Q ${w*0.98} ${h*0.85} ${w*0.85} ${h*0.95} Q ${w*0.6} ${h*1.02} ${w*0.4} ${h*0.98} Q ${w*0.15} ${h*1.0} ${w*0.05} ${h*0.85} Q ${w*-0.02} ${h*0.6} ${w*0.03} ${h*0.4} Q ${w*0.0} ${h*0.2} ${w*0.08} ${h*0.15} Z"/>`;
    },
  },
  wavyRect: {
    id: 'wavyRect',
    name: 'Wavy Rectangle',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const waves = 5;
      const amp = h * 0.04;
      let d = `M 0 ${amp}`;
      for (let i = 0; i < waves; i++) {
        const x1 = (i + 0.5) * (w / waves);
        const x2 = (i + 1) * (w / waves);
        d += ` Q ${x1} ${i % 2 === 0 ? 0 : amp * 2} ${x2} ${amp}`;
      }
      d += ` L ${w} ${h - amp}`;
      for (let i = waves - 1; i >= 0; i--) {
        const x1 = (i + 0.5) * (w / waves);
        const x2 = i * (w / waves);
        d += ` Q ${x1} ${i % 2 === 0 ? h : h - amp * 2} ${x2} ${h - amp}`;
      }
      d += ' Z';
      return `<path d="${d}"/>`;
    },
  },
  wavyOval: {
    id: 'wavyOval',
    name: 'Wavy Oval',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const bumps = 12;
      const bumpDepth = 0.06;
      let d = '';
      for (let i = 0; i < bumps; i++) {
        const angle1 = (i / bumps) * Math.PI * 2;
        const angle2 = ((i + 0.5) / bumps) * Math.PI * 2;
        const angle3 = ((i + 1) / bumps) * Math.PI * 2;
        const r1 = 0.48;
        const r2 = 0.48 - bumpDepth;
        const x1 = 0.5 + r1 * Math.cos(angle1);
        const y1 = 0.5 + r1 * Math.sin(angle1) * (h/w);
        const cx = 0.5 + r2 * Math.cos(angle2);
        const cy = 0.5 + r2 * Math.sin(angle2) * (h/w);
        const x2 = 0.5 + r1 * Math.cos(angle3);
        const y2 = 0.5 + r1 * Math.sin(angle3) * (h/w);
        if (i === 0) d += `M ${x1 * w} ${y1 * h}`;
        d += ` Q ${cx * w} ${cy * h} ${x2 * w} ${y2 * h}`;
      }
      d += ' Z';
      return `<path d="${d}"/>`;
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
  ticket: {
    id: 'ticket',
    name: 'Ticket',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const notchR = h * 0.06;
      const r = Math.min(w, h) * 0.04;
      return `<path d="M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h * 0.35 - notchR} A ${notchR} ${notchR} 0 0 1 ${w} ${h * 0.35 + notchR} L ${w} ${h * 0.65 - notchR} A ${notchR} ${notchR} 0 0 1 ${w} ${h * 0.65 + notchR} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${h * 0.65 + notchR} A ${notchR} ${notchR} 0 0 1 0 ${h * 0.65 - notchR} L 0 ${h * 0.35 + notchR} A ${notchR} ${notchR} 0 0 1 0 ${h * 0.35 - notchR} L 0 ${r} Q 0 0 ${r} 0 Z"/>`;
    },
  },
  splat: {
    id: 'splat',
    name: 'Paint Splat',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w*0.5} ${h*0.05} Q ${w*0.65} ${h*0.0} ${w*0.72} ${h*0.08} Q ${w*0.85} ${h*0.05} ${w*0.9} ${h*0.18} Q ${w*1.0} ${h*0.25} ${w*0.95} ${h*0.35} Q ${w*1.02} ${h*0.5} ${w*0.92} ${h*0.6} Q ${w*0.98} ${h*0.75} ${w*0.88} ${h*0.82} Q ${w*0.82} ${h*0.95} ${w*0.68} ${h*0.92} Q ${w*0.55} ${h*1.0} ${w*0.42} ${h*0.95} Q ${w*0.25} ${h*0.98} ${w*0.18} ${h*0.88} Q ${w*0.05} ${h*0.82} ${w*0.08} ${h*0.7} Q ${w*-0.02} ${h*0.55} ${w*0.08} ${h*0.45} Q ${w*0.02} ${h*0.3} ${w*0.12} ${h*0.22} Q ${w*0.08} ${h*0.1} ${w*0.22} ${h*0.1} Q ${w*0.35} ${h*0.02} ${w*0.5} ${h*0.05} Z"/>`;
    },
  },
  leaf: {
    id: 'leaf',
    name: 'Leaf',
    svg: (width, height) => {
      const w = width;
      const h = height;
      return `<path d="M ${w*0.5} ${h*0.02} Q ${w*0.95} ${h*0.15} ${w*0.98} ${h*0.5} Q ${w*0.95} ${h*0.85} ${w*0.5} ${h*0.98} Q ${w*0.05} ${h*0.85} ${w*0.02} ${h*0.5} Q ${w*0.05} ${h*0.15} ${w*0.5} ${h*0.02} Z"/>`;
    },
  },
  TV: {
    id: 'TV',
    name: 'Retro TV',
    svg: (width, height) => {
      const w = width;
      const h = height;
      const r = Math.min(w, h) * 0.15;
      return `<rect x="${w*0.02}" y="${h*0.02}" width="${w*0.96}" height="${h*0.96}" rx="${r}" ry="${r}"/>`;
    },
  },
  badge: {
    id: 'badge',
    name: 'Badge',
    svg: (width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2;
      const innerR = outerR * 0.85;
      const points = 12;
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

// BACKGROUND PATTERNS - Fun decorative backgrounds for kids books!
export const BACKGROUND_PATTERNS = {
  none: {
    id: 'none',
    name: 'Solid Color',
    svg: () => '',
  },
  stars: {
    id: 'stars',
    name: 'Twinkle Stars',
    svg: (w, h, colors) => {
      const starColor = colors.secondary || '#FFD700';
      let stars = '';
      const positions = [
        [0.1, 0.15, 8], [0.85, 0.1, 12], [0.25, 0.08, 6], [0.65, 0.2, 10],
        [0.05, 0.4, 7], [0.92, 0.35, 9], [0.15, 0.7, 11], [0.78, 0.65, 8],
        [0.4, 0.05, 6], [0.55, 0.12, 8], [0.08, 0.85, 10], [0.88, 0.8, 7],
        [0.35, 0.75, 5], [0.7, 0.88, 9], [0.5, 0.92, 6], [0.2, 0.55, 4],
      ];
      positions.forEach(([px, py, size]) => {
        const x = px * w;
        const y = py * h;
        stars += `<path d="M${x} ${y-size} L${x+size*0.3} ${y-size*0.3} L${x+size} ${y} L${x+size*0.3} ${y+size*0.3} L${x} ${y+size} L${x-size*0.3} ${y+size*0.3} L${x-size} ${y} L${x-size*0.3} ${y-size*0.3} Z" fill="${starColor}" opacity="0.4"/>`;
      });
      return stars;
    },
  },
  dots: {
    id: 'dots',
    name: 'Polka Dots',
    svg: (w, h, colors) => {
      const dotColor = colors.secondary || '#FFB6C1';
      let dots = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 10; col++) {
          const offset = row % 2 === 0 ? 0 : w / 20;
          const x = col * (w / 10) + w / 20 + offset;
          const y = row * (h / 8) + h / 16;
          dots += `<circle cx="${x}" cy="${y}" r="${Math.min(w,h) * 0.015}" fill="${dotColor}" opacity="0.3"/>`;
        }
      }
      return dots;
    },
  },
  hearts: {
    id: 'hearts',
    name: 'Floating Hearts',
    svg: (w, h, colors) => {
      const heartColor = colors.accent || '#FF69B4';
      let hearts = '';
      const positions = [
        [0.08, 0.12, 18], [0.88, 0.08, 14], [0.2, 0.25, 12], [0.75, 0.22, 16],
        [0.05, 0.5, 10], [0.92, 0.45, 15], [0.18, 0.78, 14], [0.82, 0.72, 12],
        [0.45, 0.06, 11], [0.55, 0.88, 13], [0.35, 0.65, 9], [0.68, 0.55, 11],
      ];
      positions.forEach(([px, py, size]) => {
        const x = px * w;
        const y = py * h;
        hearts += `<path d="M ${x} ${y+size*0.3} C ${x-size*0.5} ${y-size*0.2} ${x-size*0.5} ${y-size*0.5} ${x} ${y-size*0.3} C ${x+size*0.5} ${y-size*0.5} ${x+size*0.5} ${y-size*0.2} ${x} ${y+size*0.3} Z" fill="${heartColor}" opacity="0.25"/>`;
      });
      return hearts;
    },
  },
  dinosaurs: {
    id: 'dinosaurs',
    name: 'Dino Friends',
    svg: (w, h, colors) => {
      const dinoColor = colors.secondary || '#228B22';
      let dinos = '';
      // Simple dino silhouettes (brontosaurus-like)
      const positions = [
        [0.08, 0.15, 0.8], [0.85, 0.12, 0.6], [0.12, 0.75, 0.7], [0.82, 0.78, 0.9],
        [0.5, 0.08, 0.5], [0.45, 0.85, 0.65], [0.25, 0.45, 0.4], [0.72, 0.42, 0.55],
      ];
      positions.forEach(([px, py, scale]) => {
        const x = px * w;
        const y = py * h;
        const s = scale * Math.min(w, h) * 0.06;
        // Simple long-neck dino
        dinos += `<path d="M ${x} ${y} q ${s*0.5} ${-s*0.3} ${s} ${-s*0.8} q ${s*0.2} ${-s*0.5} ${s*0.5} ${-s*0.3} l ${s*0.3} ${s*0.2} q ${-s*0.1} ${s*0.3} ${-s*0.4} ${s*0.5} l ${s*1.5} ${s*0.2} q ${s*0.3} ${s*0.1} ${s*0.2} ${s*0.4} l ${-s*0.3} ${s*0.3} l ${s*0.1} ${s*0.5} l ${-s*0.4} 0 l 0 ${-s*0.4} l ${-s*0.8} ${s*0.1} l ${s*0.1} ${s*0.4} l ${-s*0.4} 0 l 0 ${-s*0.5} q ${-s*0.3} ${-s*0.1} ${-s*0.5} ${-s*0.2} q ${-s*0.5} ${-s*0.1} ${-s*0.9} ${-s*0.2} Z" fill="${dinoColor}" opacity="0.2"/>`;
      });
      return dinos;
    },
  },
  clouds: {
    id: 'clouds',
    name: 'Fluffy Clouds',
    svg: (w, h, colors) => {
      const cloudColor = colors.highlight || '#FFFFFF';
      let clouds = '';
      const positions = [
        [0.1, 0.12, 1.2], [0.75, 0.08, 0.9], [0.4, 0.18, 0.7], 
        [0.05, 0.45, 0.8], [0.88, 0.4, 1.0], [0.55, 0.5, 0.6],
        [0.2, 0.78, 1.1], [0.7, 0.82, 0.85], [0.45, 0.88, 0.7],
      ];
      positions.forEach(([px, py, scale]) => {
        const x = px * w;
        const y = py * h;
        const s = scale * Math.min(w, h) * 0.08;
        clouds += `<path d="M ${x} ${y} q ${-s*0.5} 0 ${-s*0.5} ${-s*0.3} q 0 ${-s*0.3} ${s*0.3} ${-s*0.4} q ${s*0.1} ${-s*0.4} ${s*0.5} ${-s*0.3} q ${s*0.4} ${-s*0.2} ${s*0.6} ${s*0.1} q ${s*0.3} ${s*0.1} ${s*0.3} ${s*0.4} q 0 ${s*0.3} ${-s*0.4} ${s*0.3} Z" fill="${cloudColor}" opacity="0.35"/>`;
      });
      return clouds;
    },
  },
  bubbles: {
    id: 'bubbles',
    name: 'Soap Bubbles',
    svg: (w, h, colors) => {
      const bubbleColor = colors.accent || '#87CEEB';
      let bubbles = '';
      const positions = [
        [0.1, 0.15, 20], [0.85, 0.1, 28], [0.25, 0.3, 15], [0.7, 0.25, 22],
        [0.05, 0.55, 18], [0.9, 0.5, 25], [0.15, 0.8, 30], [0.75, 0.75, 16],
        [0.4, 0.1, 12], [0.55, 0.65, 24], [0.35, 0.5, 10], [0.6, 0.85, 20],
        [0.5, 0.4, 14], [0.3, 0.7, 18], [0.8, 0.9, 12], [0.2, 0.05, 16],
      ];
      positions.forEach(([px, py, size]) => {
        const x = px * w;
        const y = py * h;
        bubbles += `<circle cx="${x}" cy="${y}" r="${size}" fill="none" stroke="${bubbleColor}" stroke-width="1.5" opacity="0.3"/>`;
        bubbles += `<ellipse cx="${x-size*0.3}" cy="${y-size*0.3}" rx="${size*0.2}" ry="${size*0.15}" fill="${bubbleColor}" opacity="0.4"/>`;
      });
      return bubbles;
    },
  },
  confetti: {
    id: 'confetti',
    name: 'Party Confetti',
    svg: (w, h, colors) => {
      const confettiColors = [colors.accent, colors.secondary, colors.highlight, '#FF6B6B', '#4ECDC4', '#FFE66D'];
      let confetti = '';
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const color = confettiColors[i % confettiColors.length];
        const rotation = Math.random() * 360;
        const size = 4 + Math.random() * 8;
        if (i % 3 === 0) {
          confetti += `<rect x="${x}" y="${y}" width="${size}" height="${size*0.4}" fill="${color}" opacity="0.5" transform="rotate(${rotation} ${x} ${y})"/>`;
        } else if (i % 3 === 1) {
          confetti += `<circle cx="${x}" cy="${y}" r="${size*0.3}" fill="${color}" opacity="0.5"/>`;
        } else {
          confetti += `<polygon points="${x},${y-size*0.4} ${x+size*0.35},${y+size*0.2} ${x-size*0.35},${y+size*0.2}" fill="${color}" opacity="0.5" transform="rotate(${rotation} ${x} ${y})"/>`;
        }
      }
      return confetti;
    },
  },
  waves: {
    id: 'waves',
    name: 'Ocean Waves',
    svg: (w, h, colors) => {
      const waveColor = colors.secondary || '#40E0D0';
      let waves = '';
      for (let i = 0; i < 5; i++) {
        const y = h * (0.15 + i * 0.18);
        const opacity = 0.15 + (i * 0.05);
        let d = `M 0 ${y}`;
        for (let x = 0; x <= w; x += w/8) {
          const cy = y + Math.sin((x / w) * Math.PI * 4 + i) * (h * 0.03);
          d += ` Q ${x + w/16} ${cy - h*0.02} ${x + w/8} ${cy}`;
        }
        d += ` L ${w} ${h} L 0 ${h} Z`;
        waves += `<path d="${d}" fill="${waveColor}" opacity="${opacity}"/>`;
      }
      return waves;
    },
  },
  trees: {
    id: 'trees',
    name: 'Forest Trees',
    svg: (w, h, colors) => {
      const treeColor = colors.accent || '#228B22';
      const trunkColor = colors.secondary || '#8B4513';
      let trees = '';
      const positions = [
        [0.08, 0.92, 0.8], [0.22, 0.88, 1.1], [0.38, 0.9, 0.7], [0.55, 0.85, 1.3],
        [0.72, 0.9, 0.9], [0.88, 0.88, 1.0], [0.15, 0.95, 0.6], [0.45, 0.92, 0.85],
        [0.65, 0.95, 0.7], [0.8, 0.93, 0.95],
      ];
      positions.forEach(([px, py, scale]) => {
        const x = px * w;
        const y = py * h;
        const s = scale * Math.min(w, h) * 0.1;
        // Triangle tree
        trees += `<polygon points="${x},${y-s*1.5} ${x-s*0.6},${y-s*0.3} ${x+s*0.6},${y-s*0.3}" fill="${treeColor}" opacity="0.35"/>`;
        trees += `<polygon points="${x},${y-s*1.1} ${x-s*0.5},${y-s*0.1} ${x+s*0.5},${y-s*0.1}" fill="${treeColor}" opacity="0.4"/>`;
        trees += `<rect x="${x-s*0.1}" y="${y-s*0.3}" width="${s*0.2}" height="${s*0.3}" fill="${trunkColor}" opacity="0.4"/>`;
      });
      return trees;
    },
  },
  flowers: {
    id: 'flowers',
    name: 'Garden Flowers',
    svg: (w, h, colors) => {
      const petalColors = [colors.accent, colors.secondary, colors.highlight, '#FF69B4', '#FFB347'];
      let flowers = '';
      const positions = [
        [0.1, 0.2, 12], [0.85, 0.15, 15], [0.25, 0.45, 10], [0.7, 0.35, 14],
        [0.05, 0.7, 11], [0.9, 0.65, 13], [0.18, 0.88, 16], [0.75, 0.85, 12],
        [0.4, 0.12, 9], [0.55, 0.75, 14], [0.5, 0.5, 8], [0.35, 0.68, 11],
      ];
      positions.forEach(([px, py, size], i) => {
        const x = px * w;
        const y = py * h;
        const color = petalColors[i % petalColors.length];
        // Simple 5-petal flower
        for (let p = 0; p < 5; p++) {
          const angle = (p / 5) * Math.PI * 2 - Math.PI / 2;
          const px2 = x + Math.cos(angle) * size * 0.5;
          const py2 = y + Math.sin(angle) * size * 0.5;
          flowers += `<ellipse cx="${px2}" cy="${py2}" rx="${size*0.4}" ry="${size*0.25}" fill="${color}" opacity="0.35" transform="rotate(${angle * 180 / Math.PI + 90} ${px2} ${py2})"/>`;
        }
        flowers += `<circle cx="${x}" cy="${y}" r="${size*0.25}" fill="#FFD700" opacity="0.5"/>`;
      });
      return flowers;
    },
  },
  moons: {
    id: 'moons',
    name: 'Moon & Stars',
    svg: (w, h, colors) => {
      const moonColor = colors.accent || '#FFE4B5';
      const starColor = colors.highlight || '#FFD700';
      let elements = '';
      // Big moon
      elements += `<circle cx="${w*0.82}" cy="${h*0.18}" r="${Math.min(w,h)*0.12}" fill="${moonColor}" opacity="0.5"/>`;
      elements += `<circle cx="${w*0.85}" cy="${h*0.15}" r="${Math.min(w,h)*0.1}" fill="${colors.background || '#1A1A2E'}" opacity="0.8"/>`;
      // Stars
      const starPositions = [
        [0.1, 0.1, 6], [0.25, 0.2, 4], [0.4, 0.08, 5], [0.6, 0.15, 7], [0.15, 0.35, 3],
        [0.35, 0.3, 5], [0.55, 0.28, 4], [0.08, 0.55, 6], [0.3, 0.5, 4], [0.5, 0.45, 5],
        [0.7, 0.4, 6], [0.88, 0.5, 4], [0.12, 0.75, 5], [0.4, 0.7, 4], [0.65, 0.65, 6],
        [0.85, 0.72, 5], [0.25, 0.88, 4], [0.55, 0.85, 5], [0.78, 0.9, 4],
      ];
      starPositions.forEach(([px, py, size]) => {
        const x = px * w;
        const y = py * h;
        elements += `<path d="M${x} ${y-size} L${x+size*0.3} ${y-size*0.3} L${x+size} ${y} L${x+size*0.3} ${y+size*0.3} L${x} ${y+size} L${x-size*0.3} ${y+size*0.3} L${x-size} ${y} L${x-size*0.3} ${y-size*0.3} Z" fill="${starColor}" opacity="0.5"/>`;
      });
      return elements;
    },
  },
  zigzag: {
    id: 'zigzag',
    name: 'Zigzag Lines',
    svg: (w, h, colors) => {
      const lineColor = colors.secondary || '#FFB830';
      let lines = '';
      for (let i = 0; i < 6; i++) {
        const y = h * (0.1 + i * 0.16);
        let d = `M 0 ${y}`;
        const zigWidth = w / 12;
        const zigHeight = h * 0.04;
        for (let x = 0; x < 12; x++) {
          const peakY = x % 2 === 0 ? y - zigHeight : y + zigHeight;
          d += ` L ${(x + 1) * zigWidth} ${peakY}`;
        }
        lines += `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="2" opacity="0.25"/>`;
      }
      return lines;
    },
  },
  paws: {
    id: 'paws',
    name: 'Paw Prints',
    svg: (w, h, colors) => {
      const pawColor = colors.secondary || '#D2691E';
      let paws = '';
      const positions = [
        [0.12, 0.15, 0.8, 15], [0.75, 0.1, 0.7, -20], [0.25, 0.4, 0.9, 30],
        [0.85, 0.35, 0.6, -10], [0.1, 0.65, 0.75, 45], [0.7, 0.6, 0.85, 5],
        [0.35, 0.8, 0.7, -25], [0.88, 0.82, 0.8, 20], [0.5, 0.25, 0.65, 0],
        [0.55, 0.7, 0.75, -15],
      ];
      positions.forEach(([px, py, scale, rot]) => {
        const x = px * w;
        const y = py * h;
        const s = scale * Math.min(w, h) * 0.04;
        paws += `<g transform="rotate(${rot} ${x} ${y})" opacity="0.25">
          <ellipse cx="${x}" cy="${y+s*0.3}" rx="${s*0.6}" ry="${s*0.5}" fill="${pawColor}"/>
          <ellipse cx="${x-s*0.5}" cy="${y-s*0.4}" rx="${s*0.25}" ry="${s*0.3}" fill="${pawColor}"/>
          <ellipse cx="${x-s*0.15}" cy="${y-s*0.55}" rx="${s*0.22}" ry="${s*0.28}" fill="${pawColor}"/>
          <ellipse cx="${x+s*0.2}" cy="${y-s*0.55}" rx="${s*0.22}" ry="${s*0.28}" fill="${pawColor}"/>
          <ellipse cx="${x+s*0.5}" cy="${y-s*0.4}" rx="${s*0.25}" ry="${s*0.3}" fill="${pawColor}"/>
        </g>`;
      });
      return paws;
    },
  },
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
  cloudySky: { id: 'cloudySky', name: 'Cloudy Sky', background: '#F5F9FF', text: '#3A4A5A', accent: '#6CA0DC', secondary: '#B0C4DE', highlight: '#FFFFFF' },
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
  partyTime: { id: 'partyTime', name: 'Party Time', background: '#FFFDF5', text: '#3A3040', accent: '#FF6B6B', secondary: '#9B59B6', highlight: '#F1C40F' },
  oceanDeep: { id: 'oceanDeep', name: 'Ocean Deep', background: '#E6F3F8', text: '#1A3A4A', accent: '#1E90FF', secondary: '#20B2AA', highlight: '#48D1CC' },
  forestFriends: { id: 'forestFriends', name: 'Forest Friends', background: '#F0F8E8', text: '#2A3A20', accent: '#6B8E23', secondary: '#8FBC8F', highlight: '#98FB98' },
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

// TEMPLATE DEFINITIONS - KID-FRIENDLY with backgrounds!
export const TEMPLATES = {
  // WHIMSICAL TEMPLATES
  'bubble-dream': {
    id: 'bubble-dream', name: 'Bubble Dream', description: 'Soft bubbly frame with floating bubbles', category: 'whimsical', preview: '🫧',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'bubble', padding: 0.03, border: { width: 6, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Baloo 2', baseFontSize: 24, lineHeight: 1.5, fontWeight: '600' },
    colors: COLOR_THEMES.bubblegum,
    backgroundPattern: 'bubbles',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'fluffy-cloud': {
    id: 'fluffy-cloud', name: 'Fluffy Cloud', description: 'Dreamy cloud frame with sky background', category: 'whimsical', preview: '☁️',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.1, y: 0.05, width: 0.8, height: 0.58 } }, frame: 'cloud', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Bubblegum Sans', baseFontSize: 26, lineHeight: 1.4, fontWeight: '400' },
    colors: COLOR_THEMES.cloudySky,
    backgroundPattern: 'clouds',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'rainbow-scallop': {
    id: 'rainbow-scallop', name: 'Rainbow Scallop', description: 'Scalloped frame with confetti', category: 'whimsical', preview: '🌈',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'scallop', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Fredoka One', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.rainbowBright,
    backgroundPattern: 'confetti',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'wavy-fun': {
    id: 'wavy-fun', name: 'Wavy Fun', description: 'Wavy borders with zigzag pattern', category: 'whimsical', preview: '〰️',
    layout: { image: { position: IMAGE_POSITIONS.topLarge, frame: 'wavyRect', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'top' } },
    typography: { fontFamily: 'Comic Neue', baseFontSize: 22, lineHeight: 1.6, fontWeight: '700' },
    colors: COLOR_THEMES.sunshine,
    backgroundPattern: 'zigzag',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'wobbly-world': {
    id: 'wobbly-world', name: 'Wobbly World', description: 'Fun wobbly frame with polka dots', category: 'whimsical', preview: '🎪',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'wobble', padding: 0.02, border: { width: 5, color: 'secondary' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Chewy', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.candyShop,
    backgroundPattern: 'dots',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'splat-attack': {
    id: 'splat-attack', name: 'Splat Attack', description: 'Paint splat frame for messy fun', category: 'whimsical', preview: '🎨',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'splat', padding: 0.02, border: { width: 4, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Luckiest Guy', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.partyTime,
    backgroundPattern: 'confetti',
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // ADVENTURE TEMPLATES
  'dino-stomp': {
    id: 'dino-stomp', name: 'Dino Stomp', description: 'Blob frame with dinosaur pattern', category: 'adventure', preview: '🦕',
    layout: { image: { position: IMAGE_POSITIONS.topLarge, frame: 'blob', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Sniglet', baseFontSize: 24, lineHeight: 1.5, fontWeight: '800' },
    colors: COLOR_THEMES.dinosaurDen,
    backgroundPattern: 'dinosaurs',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'superhero-shield': {
    id: 'superhero-shield', name: 'Hero Shield', description: 'Bold shield frame for heroes', category: 'adventure', preview: '🛡️',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.18, y: 0.05, width: 0.64, height: 0.58 } }, frame: 'shield', padding: 0.02, border: { width: 6, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Luckiest Guy', baseFontSize: 26, lineHeight: 1.4, fontWeight: '400' },
    colors: COLOR_THEMES.superHero,
    backgroundPattern: 'stars',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'ticket-adventure': {
    id: 'ticket-adventure', name: 'Adventure Ticket', description: 'Ticket frame for exciting journeys', category: 'adventure', preview: '🎟️',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'ticket', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Chewy', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.pirateAdventure,
    backgroundPattern: 'waves',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'star-explorer': {
    id: 'star-explorer', name: 'Star Explorer', description: 'Chunky star in space', category: 'adventure', preview: '⭐',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.15, y: 0.05, width: 0.7, height: 0.58 } }, frame: 'chunkyStar', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'top' } },
    typography: { fontFamily: 'Fredoka One', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.spaceExplorer,
    backgroundPattern: 'stars',
    effects: { pageShadow: false, imageDropShadow: true, glowEffect: true },
  },
  'forest-trek': {
    id: 'forest-trek', name: 'Forest Trek', description: 'Leaf frame with forest background', category: 'adventure', preview: '🌲',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'leaf', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Patrick Hand', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.forestFriends,
    backgroundPattern: 'trees',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'badge-quest': {
    id: 'badge-quest', name: 'Badge Quest', description: 'Award badge frame', category: 'adventure', preview: '🏅',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.15, y: 0.05, width: 0.7, height: 0.58 } }, frame: 'badge', padding: 0.02, border: { width: 4, color: 'highlight' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Baloo 2', baseFontSize: 22, lineHeight: 1.5, fontWeight: '700' },
    colors: COLOR_THEMES.superHero,
    backgroundPattern: 'none',
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // MAGICAL TEMPLATES
  'unicorn-sparkle': {
    id: 'unicorn-sparkle', name: 'Unicorn Sparkle', description: 'Heart frame with floating hearts', category: 'magical', preview: '🦄',
    layout: { image: { position: { ...IMAGE_POSITIONS.center, region: { x: 0.18, y: 0.05, width: 0.64, height: 0.58 } }, frame: 'heart', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Baloo 2', baseFontSize: 24, lineHeight: 1.5, fontWeight: '600' },
    colors: COLOR_THEMES.unicornMagic,
    backgroundPattern: 'hearts',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'mermaid-bubble': {
    id: 'mermaid-bubble', name: 'Mermaid Bubble', description: 'Wavy oval with ocean waves', category: 'magical', preview: '🧜‍♀️',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'wavyOval', padding: 0.03, border: { width: 6, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Quicksand', baseFontSize: 22, lineHeight: 1.6, fontWeight: '600' },
    colors: COLOR_THEMES.mermaidCove,
    backgroundPattern: 'waves',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'starry-wish': {
    id: 'starry-wish', name: 'Starry Wish', description: 'Night sky with moon and stars', category: 'magical', preview: '✨',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'superRounded', padding: 0.03, border: { width: 4, color: 'highlight' } }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Caveat', baseFontSize: 30, lineHeight: 1.4, fontWeight: '600' },
    colors: COLOR_THEMES.starryNight,
    backgroundPattern: 'moons',
    effects: { pageShadow: false, imageDropShadow: true, glowEffect: true },
  },
  'fairy-garden': {
    id: 'fairy-garden', name: 'Fairy Garden', description: 'Scalloped frame with flowers', category: 'magical', preview: '🌸',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'scallop', padding: 0.02, border: { width: 4, color: 'secondary' } }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Patrick Hand', baseFontSize: 26, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.fairyGarden,
    backgroundPattern: 'flowers',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'ocean-magic': {
    id: 'ocean-magic', name: 'Ocean Magic', description: 'Bubble frame with ocean bubbles', category: 'magical', preview: '🌊',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'bubble', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Nunito', baseFontSize: 22, lineHeight: 1.6, fontWeight: '600' },
    colors: COLOR_THEMES.oceanDeep,
    backgroundPattern: 'bubbles',
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // COZY TEMPLATES
  'sleepy-moon': {
    id: 'sleepy-moon', name: 'Sleepy Moon', description: 'Oval frame with moon and stars', category: 'cozy', preview: '🌙',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'oval', padding: 0.03, border: { width: 4, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Kalam', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.sleepyMoon,
    backgroundPattern: 'moons',
    effects: { pageShadow: false, imageDropShadow: true, glowEffect: true },
  },
  'cozy-paws': {
    id: 'cozy-paws', name: 'Cozy Paws', description: 'Rounded frame with paw prints', category: 'cozy', preview: '🐾',
    layout: { image: { position: IMAGE_POSITIONS.inset, frame: 'superRounded', padding: 0.03, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Nunito', baseFontSize: 22, lineHeight: 1.6, fontWeight: '600' },
    colors: COLOR_THEMES.cozyBear,
    backgroundPattern: 'paws',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'stamp-collection': {
    id: 'stamp-collection', name: 'Stamp Collection', description: 'Stamp frame for treasured memories', category: 'cozy', preview: '📮',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'stamp', padding: 0.02 }, text: { position: TEXT_POSITIONS.centered, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Schoolbell', baseFontSize: 24, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.peachyKeen,
    backgroundPattern: 'dots',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'cotton-candy': {
    id: 'cotton-candy', name: 'Cotton Candy', description: 'Cloud frame with soft clouds', category: 'cozy', preview: '🍭',
    layout: { image: { position: IMAGE_POSITIONS.topLarge, frame: 'cloud', padding: 0.02, border: { width: 4, color: 'secondary' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Varela Round', baseFontSize: 22, lineHeight: 1.6, fontWeight: '400' },
    colors: COLOR_THEMES.cottonCandy,
    backgroundPattern: 'clouds',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'retro-tv': {
    id: 'retro-tv', name: 'Retro TV', description: 'Vintage TV frame', category: 'cozy', preview: '📺',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'TV', padding: 0.02, border: { width: 8, color: 'secondary' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Chewy', baseFontSize: 22, lineHeight: 1.5, fontWeight: '400' },
    colors: COLOR_THEMES.lemonDrop,
    backgroundPattern: 'zigzag',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'pill-cozy': {
    id: 'pill-cozy', name: 'Pill Cozy', description: 'Super rounded pill shape', category: 'cozy', preview: '💊',
    layout: { image: { position: IMAGE_POSITIONS.center, frame: 'pillShape', padding: 0.02, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'Quicksand', baseFontSize: 22, lineHeight: 1.6, fontWeight: '500' },
    colors: COLOR_THEMES.mintFresh,
    backgroundPattern: 'none',
    effects: { pageShadow: false, imageDropShadow: true },
  },

  // STORYBOOK CLASSICS
  'storybook-classic': {
    id: 'storybook-classic', name: 'Classic Storybook', description: 'Traditional rounded frame', category: 'storybook', preview: '📚',
    layout: { image: { position: IMAGE_POSITIONS.top, frame: 'superRounded', padding: 0.03, border: { width: 5, color: 'accent' } }, text: { position: TEXT_POSITIONS.bottom, align: 'center', verticalAlign: 'top' } },
    typography: { fontFamily: 'Quicksand', baseFontSize: 22, lineHeight: 1.6, fontWeight: '500' },
    colors: COLOR_THEMES.sunshine,
    backgroundPattern: 'none',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'picture-perfect': {
    id: 'picture-perfect', name: 'Picture Perfect', description: 'Simple rounded frame', category: 'storybook', preview: '🖼️',
    layout: { image: { position: IMAGE_POSITIONS.inset, frame: 'rounded', padding: 0.02 }, text: { position: TEXT_POSITIONS.bottomWide, align: 'center', verticalAlign: 'center' } },
    typography: { fontFamily: 'ABeeZee', baseFontSize: 20, lineHeight: 1.7, fontWeight: '400' },
    colors: COLOR_THEMES.mintFresh,
    backgroundPattern: 'none',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'side-by-side': {
    id: 'side-by-side', name: 'Side by Side', description: 'Image left, text right', category: 'storybook', preview: '📖',
    layout: { image: { position: IMAGE_POSITIONS.left, frame: 'superRounded', padding: 0.02 }, text: { position: TEXT_POSITIONS.split, align: 'left', verticalAlign: 'center' } },
    typography: { fontFamily: 'Nunito', baseFontSize: 20, lineHeight: 1.7, fontWeight: '400' },
    colors: COLOR_THEMES.lavenderDream,
    backgroundPattern: 'none',
    effects: { pageShadow: false, imageDropShadow: true },
  },
  'full-page-magic': {
    id: 'full-page-magic', name: 'Full Page Magic', description: 'Full image with text overlay', category: 'storybook', preview: '✨',
    layout: { image: { position: IMAGE_POSITIONS.full, frame: 'rectangle', padding: 0 }, text: { position: TEXT_POSITIONS.overlay, align: 'center', verticalAlign: 'center', background: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: { x: 0.05, y: 0.02 } } },
    typography: { fontFamily: 'Poppins', baseFontSize: 20, lineHeight: 1.6, fontWeight: '500' },
    colors: { ...COLOR_THEMES.rainbowBright, background: 'transparent' },
    backgroundPattern: 'none',
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