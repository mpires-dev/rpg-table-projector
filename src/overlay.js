import { FACTIONS } from './roster.js';

/**
 * Todo o desenho do AR. Recebe tracks em coordenadas normalizadas e o Viewport
 * faz a conversão para pixel de tela.
 */
/**
 * Desenha as peças. Não limpa o canvas de propósito: o tabuleiro é desenhado
 * antes, e um clear aqui apagaria o mapa embaixo das peças.
 */
export function drawScene(ctx, { tracks, roster, view, threats, unit, settings, time, bounds }) {
  const scale = view.dpr;
  const pulse = 0.5 + 0.5 * Math.sin(time / 420);

  if (settings.drawGrid) {
    drawGrid(ctx, view, unit, scale);
  }

  if (settings.showMoveRadius) {
    for (const track of tracks) {
      drawMoveRadius(ctx, track, roster.get(track.id), view, unit, settings, scale, bounds);
    }
  }

  for (const threat of threats) {
    drawThreatLink(ctx, threat, view, scale, pulse);
  }

  for (const track of tracks) {
    drawToken(ctx, track, roster.get(track.id), view, scale, pulse, settings, unit, bounds);
  }
}

function drawMoveRadius(ctx, track, entry, view, unit, settings, scale, bounds) {
  const x = view.toScreenX(track.cx);
  const y = view.toScreenY(track.cy);
  const radius = view.toScreenLength(unit * settings.moveRadius);

  ctx.save();
  if (bounds) {
    // Fora do tabuleiro não existe movimento possível: o círculo para na borda.
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.clip();
  }
  ctx.globalAlpha = 0.28 * track.confidence;
  ctx.strokeStyle = entry.color;
  ctx.lineWidth = 1.5 * scale;
  ctx.setLineDash([8 * scale, 8 * scale]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawThreatLink(ctx, { a, b, distance }, view, scale, pulse) {
  const ax = view.toScreenX(a.cx);
  const ay = view.toScreenY(a.cy);
  const bx = view.toScreenX(b.cx);
  const by = view.toScreenY(b.cy);

  ctx.save();
  ctx.globalAlpha = (0.55 + 0.35 * pulse) * Math.min(a.confidence, b.confidence);
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = 2.5 * scale;
  ctx.setLineDash([10 * scale, 6 * scale]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);

  const label = `${distance.toFixed(1)} un`;
  ctx.font = `${12 * scale}px ui-monospace, Menlo, monospace`;
  const width = ctx.measureText(label).width + 12 * scale;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(20,6,6,0.82)';
  roundRect(ctx, mx - width / 2, my - 10 * scale, width, 20 * scale, 6 * scale);
  ctx.fill();
  ctx.fillStyle = '#ffb3b3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, mx, my);
  ctx.restore();
}

function drawToken(ctx, track, entry, view, scale, pulse, settings, unit, bounds) {
  const x = view.toScreenX(track.cx);
  const y = view.toScreenY(track.cy);
  const size = view.toScreenLength(track.size);
  const cell = unit ? view.toScreenLength(unit) : size;
  const radius = settings.projector ? Math.min(size * 0.78, cell * 0.4) : size * 0.78;
  const alpha = track.confidence;
  // No espelho da câmera frontal a rotação inverte junto com o eixo X
  const angle = view.mirrored ? Math.PI - track.angle : track.angle;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (settings.showMarkerOutline) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    track.corners.forEach((c, i) => {
      const px = view.toScreenX(c.x);
      const py = view.toScreenY(c.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  // Aura
  const glow = ctx.createRadialGradient(x, y, radius * 0.25, x, y, radius * 1.5);
  glow.addColorStop(0, hexToRgba(entry.color, 0.36));
  glow.addColorStop(1, hexToRgba(entry.color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  if (settings.projector) {
    // Na projeção o disco é preenchido: o que a mesa mostra é a luz que sai
    // daqui, então área acesa vale mais que contorno fino.
    ctx.fillStyle = hexToRgba(entry.color, 0.2);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Anel principal, pulsando de leve
  ctx.strokeStyle = entry.color;
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.arc(x, y, radius * (1 + 0.04 * pulse), 0, Math.PI * 2);
  ctx.stroke();

  // Arco de facção, marcando o "topo" da peça
  ctx.strokeStyle = FACTIONS[entry.faction]?.ring || FACTIONS.neutral.ring;
  ctx.lineWidth = 5 * scale;
  ctx.beginPath();
  ctx.arc(x, y, radius * (settings.projector ? 1.12 : 1.22), angle - 0.55, angle + 0.55);
  ctx.stroke();

  // Seta de orientação: pra onde a peça está virada
  const reach = settings.projector ? 1.3 : 1.5;
  const tipX = x + Math.cos(angle) * radius * reach;
  const tipY = y + Math.sin(angle) * radius * reach;
  ctx.fillStyle = entry.color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    x + Math.cos(angle + 2.5) * radius * 1.05,
    y + Math.sin(angle + 2.5) * radius * 1.05
  );
  ctx.lineTo(
    x + Math.cos(angle - 2.5) * radius * 1.05,
    y + Math.sin(angle - 2.5) * radius * 1.05
  );
  ctx.closePath();
  ctx.fill();

  drawLabel(ctx, entry, track, x, y, radius, scale, settings, bounds, cell);
  ctx.restore();
}

/**
 * Rótulo da peça. Na projeção ele é uma etiqueta curta dimensionada pela casa, e
 * vira para baixo quando não cabe acima — senão o nome da peça da primeira
 * fileira sai da mesa e é projetado na parede.
 */
function drawLabel(ctx, entry, track, x, y, radius, scale, settings, bounds, cell) {
  const projector = Boolean(settings.projector);
  const titleSize = projector
    ? Math.max(9, Math.min(15 * scale, cell * 0.2))
    : 14 * scale;
  const subtitle = track.visible ? entry.role : 'oculta…';
  const showSubtitle = !projector;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${titleSize}px system-ui, -apple-system, sans-serif`;
  const title = projector ? truncate(ctx, entry.name, cell * 1.35) : entry.name;
  let boxWidth = ctx.measureText(title).width;
  if (showSubtitle) {
    ctx.font = `${titleSize * 0.78}px system-ui, -apple-system, sans-serif`;
    boxWidth = Math.max(boxWidth, ctx.measureText(subtitle).width);
  }
  boxWidth += titleSize * 1.4;

  const boxHeight = showSubtitle ? titleSize * 2.85 : titleSize * 1.75;
  const gap = radius * 0.55;
  let boxY = y - radius - gap - boxHeight;

  // Não coube acima da peça: desce para o outro lado.
  if (bounds && boxY < bounds.top) {
    const below = y + radius + gap;
    boxY = below + boxHeight <= bounds.bottom ? below : Math.max(bounds.top, boxY);
  }

  const boxX = x - boxWidth / 2;
  ctx.fillStyle = 'rgba(9,12,20,0.8)';
  roundRect(ctx, boxX, boxY, boxWidth, boxHeight, titleSize * 0.5);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(entry.color, 0.7);
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRect(ctx, boxX, boxY, boxWidth, boxHeight, titleSize * 0.5);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${titleSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(title, x, boxY + (showSubtitle ? titleSize * 1.05 : boxHeight / 2));

  if (showSubtitle) {
    ctx.fillStyle = hexToRgba(entry.color, 0.95);
    ctx.font = `${titleSize * 0.78}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(subtitle, x, boxY + titleSize * 2.1);
  }
  ctx.restore();
}

/** Encurta o texto até caber, com reticências. A fonte já está aplicada no ctx. */
function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text.length;
  while (cut > 1 && ctx.measureText(`${text.slice(0, cut)}…`).width > maxWidth) cut--;
  return `${text.slice(0, cut)}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const int = parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Grade de fundo do modo simulação, com passo de 1 unidade de marcador. Dá
 * noção de escala quando não existe imagem de câmera por baixo.
 */
function drawGrid(ctx, view, unit, scale) {
  const step = view.toScreenLength(unit);
  if (step < 12) return;

  ctx.save();
  ctx.fillStyle = '#0a0e18';
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.strokeStyle = 'rgba(110,168,255,0.14)';
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  for (let x = view.originX % step; x < view.width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
  }
  for (let y = view.originY % step; y < view.height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Pontos já coletados na calibração, desenhados sobre o vídeo da câmera para a
 * pessoa conferir se clicou onde queria antes de fechar a matriz.
 */
export function drawCalibrationPoints(ctx, view, points, index) {
  const scale = view.dpr;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  points.forEach((point, i) => {
    const x = view.toScreenX(point.x);
    const y = view.toScreenY(point.y);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(x, y, 14 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 20 * scale, y);
    ctx.lineTo(x + 20 * scale, y);
    ctx.moveTo(x, y - 20 * scale);
    ctx.lineTo(x, y + 20 * scale);
    ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.font = `700 ${11 * scale}px system-ui, sans-serif`;
    ctx.fillText(String(i + 1), x + 22 * scale, y - 16 * scale);
  });

  const message = `Toque onde aparece o alvo ${index + 1}`;
  ctx.font = `600 ${15 * scale}px system-ui, sans-serif`;
  const width = ctx.measureText(message).width + 28 * scale;
  const boxX = view.width / 2 - width / 2;
  const boxY = view.height * 0.14;
  ctx.fillStyle = 'rgba(9,12,20,0.85)';
  ctx.strokeStyle = 'rgba(255,200,87,0.7)';
  ctx.lineWidth = 1.5 * scale;
  roundRect(ctx, boxX, boxY, width, 38 * scale, 10 * scale);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffc857';
  ctx.fillText(message, view.width / 2, boxY + 19 * scale);
  ctx.restore();
}
