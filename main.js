import { ALPHABET } from './alphabet.js';

const svg = document.getElementById("svg");
const exportBtn = document.getElementById("export");
const calcHeightLabel = document.getElementById("calcHeight");

// --- ETAT ---
const state = {
  padX: 2,
  padY: 2,
  lineSpace: 2,
  align: 'center',
  gridWidth: 0,
  gridHeight: 0
};

// --- INIT ---
["dotScale", "text"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    updateDesignLabels();
    render();
    updateExportInfo();
  });
});
document.getElementById("exportWidth").addEventListener("input", updateExportInfo);

document.querySelectorAll('input[name="align"]').forEach(r => r.addEventListener("change", (e) => {
  state.align = e.target.value;
  render();
}));

setupStepper("padX");
setupStepper("padY");
setupStepper("lineSpace");

function setupStepper(key) {
  document.getElementById(`${key}-minus`).addEventListener("click", () => updateState(key, -1));
  document.getElementById(`${key}-plus`).addEventListener("click", () => updateState(key, 1));
}

// --- HELPERS STATE ---
function updateState(key, delta) {
  state[key] += delta;
  if(state[key] < 0) state[key] = 0;
  if(key === 'lineSpace' && state[key] < 1) state[key] = 1;

  document.getElementById(`${key}-val`).textContent = state[key];
  render();
  updateExportInfo();
}

function updateDesignLabels() {
  document.getElementById("dotScaleVal").textContent = document.getElementById("dotScale").value + "%";
}

function updateExportInfo() {
  const widthCm = Number(document.getElementById("exportWidth").value);
  document.getElementById("exportWidthVal").textContent = widthCm + " cm";
  if (state.gridWidth > 0) {
    const ratio = state.gridHeight / state.gridWidth;
    const heightCm = widthCm * ratio;
    calcHeightLabel.textContent = heightCm.toFixed(1) + " cm";
  }
}

// --- LOGIQUE METIER ---

function getLines() {
  const raw = document.getElementById("text").value;
  return (raw && raw.trim().length > 0 ? raw : "FTSHIRT").toUpperCase().split('\n');
}

function getCharMatrix(char) {
  return ALPHABET[char] || ALPHABET[" "] || Array(7).fill([0,0,0,0,0]);
}

function getCharWidth(char) {
  const matrix = getCharMatrix(char);
  return matrix[0] ? matrix[0].length : 5;
}

function getLineWidthPoints(lineText) {
  let width = 0;
  for (let i = 0; i < lineText.length; i++) {
    width += getCharWidth(lineText[i]);
    if (i < lineText.length - 1) {
      width += 1; 
    }
  }
  return width;
}

/**
 * Génère la commande SVG (d) pour dessiner un cercle à l'aide d'arcs.
 * Cela permet d'inclure le cercle dans un <path> composite.
 */
function getCirclePathData(cx, cy, r) {
  // Move to top, Arc down, Arc up
  return `M ${cx} ${cy - r} A ${r} ${r} 0 1 0 ${cx} ${cy + r} A ${r} ${r} 0 1 0 ${cx} ${cy - r} `;
}

// --- RENDER OPTIMISÉ (COMPOUND PATHS) ---

function render() {
  const lines = getLines();
  const dotScale = Number(document.getElementById("dotScale").value);
  
  // Rayon relatif (0.5 = touche les bords)
  const relativeRadius = (dotScale / 100) * 0.5;

  const letterHeight = 7;
  const gapX = 1; 

  // 1. Calcul largeurs
  const linesWidths = lines.map(line => getLineWidthPoints(line));
  const maxLineWidth = Math.max(...linesWidths, 0);

  // 2. Dimensions Grille
  state.gridWidth = maxLineWidth + (state.padX * 2);
  const totalLettersHeight = lines.length * letterHeight;
  const totalInterlineHeight = Math.max(0, lines.length - 1) * state.lineSpace;
  state.gridHeight = state.padY + totalLettersHeight + totalInterlineHeight + state.padY;

  // Setup SVG
  svg.setAttribute("viewBox", `0 0 ${state.gridWidth} ${state.gridHeight}`);
  svg.innerHTML = "";
  
  // On ne crée plus de groupe <g>, mais on prépare les tableaux de coordonnées
  // Deux tableaux pour stocker les chemins : un pour le texte, un pour le fond
  const activePaths = [];
  const inactivePaths = [];

  // 3. Boucle de calcul (sans dessin immédiat)
  for(let y = 0; y < state.gridHeight; y++){
    for(let x = 0; x < state.gridWidth; x++){
      
      let isActive = false;
      const contentY = y - state.padY;
      
      if(contentY >= 0 && contentY < (state.gridHeight - state.padY * 2)) {
        
        const strideY = letterHeight + state.lineSpace;
        const lineIndex = Math.floor(contentY / strideY);
        const withinLineY = contentY % strideY;

        if(lineIndex < lines.length && withinLineY < letterHeight) {
          const currentLineText = lines[lineIndex];
          const currentLineWidth = linesWidths[lineIndex];

          let startX = state.padX;
          if (state.align === 'center') startX += Math.floor((maxLineWidth - currentLineWidth) / 2);
          else if (state.align === 'right') startX += (maxLineWidth - currentLineWidth);

          const relX = x - startX;

          if(relX >= 0 && relX < currentLineWidth) {
            let cursor = 0;
            for(let i = 0; i < currentLineText.length; i++) {
              const char = currentLineText[i];
              const w = getCharWidth(char);
              
              if(relX >= cursor && relX < cursor + w) {
                const colInChar = relX - cursor;
                const matrix = getCharMatrix(char);
                if(matrix[withinLineY] && matrix[withinLineY][colInChar]) {
                  isActive = true;
                }
                break;
              }
              cursor += w + gapX;
              if (cursor > relX) break;
            }
          }
        }
      }

      // Génération du tracé pour ce point précis
      // x + 0.5 car le cercle est centré dans la case
      const pathData = getCirclePathData(x + 0.5, y + 0.5, relativeRadius);
      
      if (isActive) {
        activePaths.push(pathData);
      } else {
        inactivePaths.push(pathData);
      }
    }
  }

  // 4. Création des éléments DOM uniques
  
  // Calque Fond (Grille inactive)
  if (inactivePaths.length > 0) {
    const pathInactive = document.createElementNS("http://www.w3.org/2000/svg","path");
    pathInactive.setAttribute("d", inactivePaths.join("")); // On fusionne tout en un seul string
    pathInactive.setAttribute("fill", "#333333");
    pathInactive.setAttribute("id", "layer-grid"); // Pour identification facile
    svg.appendChild(pathInactive);
  }

  // Calque Texte (Points actifs)
  if (activePaths.length > 0) {
    const pathActive = document.createElementNS("http://www.w3.org/2000/svg","path");
    pathActive.setAttribute("d", activePaths.join("")); // Fusion
    pathActive.setAttribute("fill", "#FFFFFF");
    pathActive.setAttribute("id", "layer-text");
    svg.appendChild(pathActive);
  }
}

// --- EXPORT ---
exportBtn.addEventListener("click", function(){
  const clonedSvg = svg.cloneNode(true);
  const widthCm = Number(document.getElementById("exportWidth").value);
  
  if(state.gridWidth === 0) return;

  const ratio = state.gridHeight / state.gridWidth;
  const heightCm = widthCm * ratio;

  clonedSvg.setAttribute("width", `${widthCm}cm`);
  clonedSvg.setAttribute("height", `${heightCm}cm`);

  const content = '<?xml version="1.0" encoding="UTF-8"?>\n' + clonedSvg.outerHTML;
  const blob = new Blob([content], {type:"image/svg+xml"});
  const url = URL.createObjectURL(blob);
  
  const rawText = document.getElementById("text").value.trim() || "ftshirt";
  const safeText = rawText.substring(0, 15).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.getHours() + "h" + String(now.getMinutes()).padStart(2, '0');
  const filename = `${safeText}_${dateStr}_${timeStr}_dot.svg`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Start
updateDesignLabels();
render();
updateExportInfo();
