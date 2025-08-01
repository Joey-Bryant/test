/**
 * **********************************************************************************
 * Title: Star Battle Rendering and UI Drawing Engine
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.0.0
 * *-------------------------------------------------------------------------------
 * This script is responsible for all visual rendering and drawing for the Star
 * Battle puzzle application. It handles the initial generation of the puzzle
 * grid within the DOM, including applying procedural colors and thick borders
 * to delineate regions. It manages canvas overlays for features like free-form
 * drawing, custom region bordering, and displaying the puzzle solution. The
 * script also includes logic for dynamically highlighting invalid star placements
 * in real-time and rendering the interactive color picker UI. All functions
 * are designed to read from the central `state` object to ensure the UI is a
 * consistent reflection of the application's data.
 * **********************************************************************************
 */

// --- RENDERING & DRAWING ---

// --- DOM GRID RENDERING ---

/**
 * Renders the entire puzzle grid from scratch based on the current state.
 * It builds the grid cells, applies region borders and background colors,
 * and sets the initial marks for each cell.
 * @returns {void}
 */
function renderGrid() {
    gridContainer.innerHTML = '';
    if (!state.gridDim || !state.regionGrid || state.regionGrid.length === 0) return;
    gridContainer.classList.toggle('bw-mode', state.isBwMode);

    // Set up CSS grid properties for the container
    gridContainer.style.gridTemplateColumns = `repeat(${state.gridDim}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${state.gridDim}, 1fr)`;
    gridContainer.style.setProperty('--grid-dim', state.gridDim);

    // Create and style each cell
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.r = r; cell.dataset.c = c;

            // Apply procedural background colors to regions if not in B&W mode
            if (!state.isBwMode) {
                const regionId = state.regionGrid[r][c];
                const hue = (regionId * 67) % 360; // Use a prime multiplier for good hue distribution
                const isSaturated = regionId % 2 === 1;
                const sat = isSaturated ? 65 : 100;
                const light = isSaturated ? 77 : 90;
                cell.style.backgroundColor = `hsl(${hue}, ${sat}%, ${light}%)`;
            }

            // Add thick border classes by checking neighboring region IDs
            if (c > 0 && state.regionGrid[r][c - 1] !== state.regionGrid[r][c]) cell.classList.add('region-border-l');
            if (c < state.gridDim - 1 && state.regionGrid[r][c + 1] !== state.regionGrid[r][c]) cell.classList.add('region-border-r');
            if (r > 0 && state.regionGrid[r - 1][c] !== state.regionGrid[r][c]) cell.classList.add('region-border-t');
            if (r < state.gridDim - 1 && state.regionGrid[r + 1][c] !== state.regionGrid[r][c]) cell.classList.add('region-border-b');

            updateCellMark(cell, state.playerGrid[r][c]);
            gridContainer.appendChild(cell);
        }
    }
    resizeCanvas();
    redrawAllOverlays();
}

/**
 * Updates the content of a single grid cell to display the appropriate mark (star, X, dot, or empty).
 * @param {HTMLElement} cellElement - The DOM element for the grid cell.
 * @param {number} markState - The state of the mark (0: empty, 1: star, 2: X/dot).
 * @returns {void}
 */
function updateCellMark(cellElement, markState) {
    if (!cellElement) return;
    switch (markState) {
        case 1: cellElement.innerHTML = STAR_SVG; break;
        case 2: cellElement.innerHTML = state.markIsX ? X_SVG : DOT_SVG; break;
        default: cellElement.innerHTML = ''; break;
    }
}

/**
 * Re-renders the marks in all cells. Useful when a global setting that affects
 * marks, like toggling between 'X' and 'dot', is changed.
 * @returns {void}
 */
function renderAllMarks() {
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            const cell = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
            updateCellMark(cell, state.playerGrid[r][c]);
        }
    }
}

// --- ERROR HIGHLIGHTING ---

/**
 * Checks the entire grid for rule violations (adjacent stars, too many stars per
 * row/column/region) and applies a visual 'error' style to the offending stars.
 * @returns {void}
 */
function updateErrorHighlightingUI() {
    const invalidStarCoords = new Set();
    // First, clear all existing error highlights
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            const cell = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
            if (cell) cell.classList.remove('error-star');
        }
    }

    if (!state.highlightErrors || state.gridDim === 0) return;

    // Tally up star counts and positions
    const stars = [];
    const rowCounts = Array(state.gridDim).fill(0);
    const colCounts = Array(state.gridDim).fill(0);
    const regionStars = {};
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            if (state.playerGrid[r][c] === 1) {
                const starPos = { r, c };
                stars.push(starPos);
                rowCounts[r]++;
                colCounts[c]++;
                const regionId = state.regionGrid[r][c];
                if (!regionStars[regionId]) regionStars[regionId] = [];
                regionStars[regionId].push(starPos);
            }
        }
    }

    // Check for adjacent stars (including diagonally)
    stars.forEach(star => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = star.r + dr;
                const nc = star.c + dc;
                if (nr >= 0 && nr < state.gridDim && nc >= 0 && nc < state.gridDim && state.playerGrid[nr][nc] === 1) {
                    invalidStarCoords.add(`${star.r},${star.c}`);
                }
            }
        }
    });

    // Check for too many stars in a row
    for (let r = 0; r < state.gridDim; r++) {
        if (rowCounts[r] > state.starsPerRegion) {
            stars.forEach(star => {
                if (star.r === r) invalidStarCoords.add(`${star.r},${star.c}`);
            });
        }
    }

    // Check for too many stars in a column
    for (let c = 0; c < state.gridDim; c++) {
        if (colCounts[c] > state.starsPerRegion) {
            stars.forEach(star => {
                if (star.c === c) invalidStarCoords.add(`${star.r},${star.c}`);
            });
        }
    }

    // Check for too many stars in a region
    for (const regionId in regionStars) {
        if (regionStars[regionId].length > state.starsPerRegion) {
            regionStars[regionId].forEach(star => {
                invalidStarCoords.add(`${star.r},${star.c}`);
            });
        }
    }

    // Apply the error class to all identified invalid stars
    invalidStarCoords.forEach(coord => {
        const [r, c] = coord.split(',');
        const cellElement = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
        if (cellElement) cellElement.classList.add('error-star');
    });
}

// --- CANVAS MANAGEMENT & OVERLAYS ---

/**
 * Resizes the drawing and buffer canvases to match the grid container's dimensions.
 * It preserves the existing drawing content by temporarily drawing it to another
 * canvas and then scaling it onto the newly sized canvas.
 * @returns {void}
 */
function resizeCanvas() {
    // Create a temporary canvas to hold the old content
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const oldWidth = state.bufferCanvas.width;
    const oldHeight = state.bufferCanvas.height;

    if (oldWidth > 0 && oldHeight > 0) {
        tempCanvas.width = oldWidth;
        tempCanvas.height = oldHeight;
        tempCtx.drawImage(state.bufferCanvas, 0, 0);
    }

    // Get the new dimensions from the DOM
    const rect = gridContainer.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        // Resize both the visible and buffer canvases
        drawCanvas.width = rect.width;
        drawCanvas.height = rect.height;
        state.bufferCanvas.width = rect.width;
        state.bufferCanvas.height = rect.height;
        state.bufferCtx = state.bufferCanvas.getContext('2d');

        // Draw the old content back onto the resized buffer
        if (tempCanvas.width > 0) {
            state.bufferCtx.drawImage(tempCanvas, 0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
        }
    }

    redrawAllOverlays();
}

/**
 * Draws the solution overlay on the main drawing canvas.
 * It renders translucent, shadowed circles over the cells where stars should be.
 * @returns {void}
 */
function drawSolutionOverlay() {
    if (!state.solution) return;
    const cellWidth = drawCanvas.width / state.gridDim;
    const cellHeight = drawCanvas.height / state.gridDim;

    drawCtx.fillStyle = 'rgba(252, 211, 77, 0.7)'; // Translucent yellow
    drawCtx.shadowColor = 'rgba(0, 0, 0, .7)';
    drawCtx.shadowBlur = 15;

    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            if (state.solution[r][c] === 1) {
                const x = c * cellWidth + cellWidth / 2;
                const y = r * cellHeight + cellHeight / 2;
                const radius = cellWidth / 3.5;

                drawCtx.beginPath();
                drawCtx.arc(x, y, radius, 0, 2 * Math.PI);
                drawCtx.fill();
            }
        }
    }

    drawCtx.shadowBlur = 0; // Reset shadow for other drawing operations
}

/**
 * The main drawing loop. It clears the visible canvas and redraws all layers in
 * the correct order: the buffered free-form drawing, custom borders, and finally
 * the solution overlay if active.
 * @returns {void}
 */
function redrawAllOverlays() {
    if (!drawCanvas.width || !drawCanvas.height) return;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    // Draw the persistent drawing layer from the buffer
    if (state.bufferCtx) {
        drawCtx.drawImage(state.bufferCanvas, 0, 0);
    }
    // Draw any user-made borders on top
    drawCustomBorders();
    // Draw the solution overlay on top if active
    if (state.isViewingSolution) {
        drawSolutionOverlay();
    }
}

/**
 * Renders custom borders drawn by the user onto the main canvas.
 * It intelligently draws only the exterior edges of a group of connected cells.
 * @returns {void}
 */
function drawCustomBorders() {
    if (!state.gridDim || state.gridDim === 0 || !drawCanvas.width) return;
    const cellWidth = drawCanvas.width / state.gridDim;
    const cellHeight = drawCanvas.height / state.gridDim;
    const thickness = 8; // Border thickness in pixels

    // Include the border currently being drawn
    const allBorders = [...state.customBorders];
    if (state.currentBorderPath.size > 0) {
        allBorders.push({ path: state.currentBorderPath, color: state.currentColor });
    }

    allBorders.forEach(border => {
        drawCtx.fillStyle = border.color;
        border.path.forEach(cellPos => {
            const [r, c] = cellPos.split(',').map(Number);
            const x = c * cellWidth;
            const y = r * cellHeight;
            // Only draw a line if there is no adjacent cell in the same border path
            if (!border.path.has(`${r - 1},${c}`)) drawCtx.fillRect(x, y, cellWidth, thickness); // Top
            if (!border.path.has(`${r + 1},${c}`)) drawCtx.fillRect(x, y + cellHeight - thickness, cellWidth, thickness); // Bottom
            if (!border.path.has(`${r},${c - 1}`)) drawCtx.fillRect(x, y, thickness, cellHeight); // Left
            if (!border.path.has(`${r},${c + 1}`)) drawCtx.fillRect(x + cellWidth - thickness, y, thickness, cellHeight); // Right
        });
    });
}

// --- UI COMPONENT RENDERING ---

/**
 * Renders the color picker UI, including preset and custom color slots.
 * It adds a 'selected' class to the currently active color.
 * @returns {void}
 */
function renderColorPicker() {
    const colorSlotsContainer = document.getElementById('color-slots-container');
    if (!colorSlotsContainer) return;

    let allSlotsHTML = '';
    // Generate HTML for preset color slots
    allSlotsHTML += PRESET_COLORS.map(color =>
        `<div class="color-slot" data-color="${color}" style="background-color: ${color};"></div>`
    ).join('');
    // Generate HTML for custom color slots (or empty slots)
    allSlotsHTML += state.customColors.map((color, index) => {
        if (color) {
            return `<div class="color-slot" data-color="${color}" style="background-color: ${color};"></div>`;
        } else {
            return `<div class="color-slot empty" data-custom-index="${index}"></div>`;
        }
    }).join('');

    colorSlotsContainer.innerHTML = allSlotsHTML;
    // Highlight the currently selected color
    document.querySelectorAll('#color-picker-wrapper .color-slot').forEach(slot => {
        slot.classList.toggle('selected', slot.dataset.color === state.currentColor);
    });
}