import React, { useState, useEffect, useCallback, useRef } from "react";
import GetSimulation from "./GetSimulation";
import "./App.css";
import SimulationPlayback from "./SimulationPlayBack";

const DEFAULT_ROWS = 20;
const DEFAULT_COLS = 20;

function createEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

function App() {
  const [selectedTool, setSelectedTool] = useState("player");
  const [gridRows, setGridRows] = useState(DEFAULT_ROWS);
  const [gridCols, setGridCols] = useState(DEFAULT_COLS);
  // We no longer have a defender slider.
  const [grid, setGrid] = useState(createEmptyGrid(DEFAULT_ROWS, DEFAULT_COLS));
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [simulationData, setSimulationData] = useState(null);
  const [showSimulation, setShowSimulation] = useState(false);
  const [gptInputValue, setGptInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [routes, setRoutes] = useState({}); // Store routes for each player
  const [activeRoutingPlayer, setActiveRoutingPlayer] = useState(null); // Track which player is being routed
  const [lastClickedCell, setLastClickedCell] = useState(null); // Track last clicked cell for double-click detection

  // Simulation parameter states.
  const [attackerParams, setAttackerParams] = useState({
    vision_range: 5,
    sound_radius: 4,
    reaction: 1.0,
  });
  const [defenderParams, setDefenderParams] = useState({
    vision_range: 4,
    sound_radius: 4,
    reaction: 1.0,
  });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const gridRef = useRef(null);

  // Get cell center coordinates
  const getCellCenter = (rowIndex, colIndex) => {
    const cells = document.querySelectorAll('.grid-cell');
    const cellIndex = rowIndex * gridCols + colIndex;
    const cell = cells[cellIndex];
    if (!cell) return { x: 0, y: 0 };

    const rect = cell.getBoundingClientRect();
    const gridRect = gridRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - gridRect.left,
      y: rect.top + rect.height / 2 - gridRect.top
    };
  };

  // Track mouse position relative to grid
  const handleMouseMove = (e) => {
    if (gridRef.current) {
      const rect = gridRef.current.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  // Render route lines
  const RouteLines = () => {
    if (!activeRoutingPlayer && Object.keys(routes).length === 0) return null;

    return (
      <svg className="route-lines" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* Existing route lines */}
        {Object.entries(routes).map(([playerPos, route]) => {
          const [playerRow, playerCol] = playerPos.split('-').map(Number);
          const playerCenter = getCellCenter(playerRow, playerCol);

          return (
            <g key={playerPos}>
              {/* Line from player to first point */}
              {route.length > 0 && (
                <line
                  x1={playerCenter.x}
                  y1={playerCenter.y}
                  x2={getCellCenter(route[0].row, route[0].col).x}
                  y2={getCellCenter(route[0].row, route[0].col).y}
                  className="route-line"
                />
              )}
              {/* Lines between route points */}
              {route.map((point, index) => {
                if (index === route.length - 1) return null;
                const start = getCellCenter(point.row, point.col);
                const end = getCellCenter(route[index + 1].row, route[index + 1].col);
                return (
                  <line
                    key={`${point.row}-${point.col}-${index}`}
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    className="route-line"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Active routing line following cursor */}
        {activeRoutingPlayer && (
          <g>
            {/* If no route points yet, draw from player to cursor */}
            {(!routes[activeRoutingPlayer] || routes[activeRoutingPlayer].length === 0) && (
              <line
                x1={getCellCenter(...activeRoutingPlayer.split('-').map(Number)).x}
                y1={getCellCenter(...activeRoutingPlayer.split('-').map(Number)).y}
                x2={mousePosition.x}
                y2={mousePosition.y}
                className="route-line route-line-preview"
              />
            )}
            {/* If there are route points, draw from last point to cursor */}
            {routes[activeRoutingPlayer] && routes[activeRoutingPlayer].length > 0 && (
              <line
                x1={getCellCenter(
                  routes[activeRoutingPlayer][routes[activeRoutingPlayer].length - 1].row,
                  routes[activeRoutingPlayer][routes[activeRoutingPlayer].length - 1].col
                ).x}
                y1={getCellCenter(
                  routes[activeRoutingPlayer][routes[activeRoutingPlayer].length - 1].row,
                  routes[activeRoutingPlayer][routes[activeRoutingPlayer].length - 1].col
                ).y}
                x2={mousePosition.x}
                y2={mousePosition.y}
                className="route-line route-line-preview"
              />
            )}
          </g>
        )}
      </svg>
    );
  };

  // --- UPDATED processGridState ---
  // This function now checks if a cell is a wall by testing both
  // for the string "wall" or an object with type "wall".
  function processGridState() {
    const processedGrid = [];
    const attacker_positions = [];
    const defender_positions = [];
    for (let rowIndex = 0; rowIndex < grid.length; rowIndex++) {
      const newRow = [];
      for (let colIndex = 0; colIndex < grid[rowIndex].length; colIndex++) {
        const cell = grid[rowIndex][colIndex];
        if (
          cell === "wall" ||
          (cell && typeof cell === "object" && cell.type === "wall")
        ) {
          newRow.push(1);
        } else {
          newRow.push(0);
        }
        if (cell && typeof cell === "object") {
          if (cell.type === "player") {
            // Record as [x, y, orientation]
            attacker_positions.push([colIndex, rowIndex, cell.orientation]);
          } else if (cell.type === "defender") {
            defender_positions.push([colIndex, rowIndex, cell.orientation]);
          }
        }
      }
      processedGrid.push(newRow);
    }

    const routeParsed = {}
    for (let key in routes) {
      routeParsed[key] = routes[key].map(({row, col}) => ({
          coord: {
            row, col
          },
          tickTime: 10
      }))
    }

    console.log(JSON.stringify({
      grid: processedGrid,
      attacker_positions,
      defender_positions,
      attacker_params: attackerParams,
      defender_params: defenderParams,
      route_data: routeParsed
    }))

    return {
      grid: processedGrid,
      attacker_positions,
      defender_positions,
      attacker_params: attackerParams,
      defender_params: defenderParams,
      route_data: routeParsed
    };
  }
  // --- END UPDATED processGridState ---

  useEffect(() => {
    setGrid(createEmptyGrid(gridRows, gridCols));
  }, [gridRows, gridCols]);

  // updateCell remains the same
  const updateCell = (rowIndex, colIndex) => {
    if (selectedTool === "router") {
      const cellKey = `${rowIndex}-${colIndex}`;
      const cell = grid[rowIndex][colIndex];

      if (activeRoutingPlayer == null && cell && typeof cell === "object" && cell.type === "player") {
        // Clicking on a player initiates routing for that player
        setActiveRoutingPlayer(`${rowIndex}-${colIndex}`);
        // Clear existing route for this player
        setRoutes(prev => ({ ...prev, [`${rowIndex}-${colIndex}`]: [] }));
        return;
      }

      if (activeRoutingPlayer) {
        if (cellKey === lastClickedCell) {
          // Double click on same cell exits routing mode
          setActiveRoutingPlayer(null);
          setLastClickedCell(null);
        } else {
          // Add new point to route
          setRoutes(prev => ({
            ...prev,
            [activeRoutingPlayer]: [
              ...(prev[activeRoutingPlayer] || []),
              { row: rowIndex, col: colIndex }
            ]
          }));
          setLastClickedCell(cellKey);
        }
      }
      return;
    }

    // Existing cell update logic
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map((row) => [...row]);
      const current = newGrid[rowIndex][colIndex];
      if (selectedTool === "eraser") {
        // When erasing a player, also remove their route
        if (current && current.type === "player") {
          setRoutes(prev => {
            const newRoutes = { ...prev };
            delete newRoutes[`${rowIndex}-${colIndex}`];
            return newRoutes;
          });
        }
        newGrid[rowIndex][colIndex] = null;
      } else if (
        current &&
        typeof current === "object" &&
        current.type === selectedTool
      ) {
        current.orientation = (current.orientation + Math.PI / 4) % (2 * Math.PI);
        newGrid[rowIndex][colIndex] = current;
      } else {
        newGrid[rowIndex][colIndex] = { type: selectedTool, orientation: 0 };
      }
      return newGrid;
    });
  };

  const handleMouseDown = (rowIndex, colIndex) => {
    setIsMouseDown(true);
    updateCell(rowIndex, colIndex);
  };

  const handleMouseEnter = (rowIndex, colIndex) => {
    if (isMouseDown) {
      updateCell(rowIndex, colIndex);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => setIsMouseDown(false);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // renderCellContent remains essentially the same.
  const renderCellContent = (cellValue, rowIndex, colIndex) => {
    const cellContent = cellValue && typeof cellValue === "object" ? (
      cellValue.type === "wall" ? (
        "🟦"
      ) : (
        <span>
          {cellValue.type === "player" ? "👮" : "🦹"}
          <span
            className="viewport-arrow"
            style={{ transform: `rotate(${cellValue.orientation * 180 / Math.PI}deg)` }}
          >
            ➤
          </span>
        </span>
      )
    ) : (
      cellValue === "wall" ? "⬛" : ""
    );

    // Add route point indicators
    const isRoutePoint = Object.entries(routes).some(([playerPos, route]) =>
      route.some(point => point.row === rowIndex && point.col === colIndex)
    );

    return (
      <div className={`cell-content ${isRoutePoint ? 'route-point' : ''}`}>
        {cellContent}
        {isRoutePoint && <div className="route-indicator" />}
      </div>
    );
  };

  const handleClaudeCall = useCallback(async (input) => {
    try {
      // Encode the prompt to handle special characters in URLs
      const prompt = `
              the current json representation of our grid state looks like this:
              {
                "attacker_params": {
                  "vision_range": ${attackerParams.vision_range},
                  "sound_radius": ${attackerParams.sound_radius},
                  "reaction": ${attackerParams.reaction}
                },
                "defender_params": {
                  "vision_range": ${defenderParams.vision_range},
                  "sound_radius": ${defenderParams.sound_radius},
                  "reaction": ${defenderParams.reaction}
                },
                "columns": ${gridCols},
                "rows": ${gridRows},
                "grid": ${JSON.stringify(grid)}
              }

              the user has specified the following changes they would like to be made:
              ${input}
              
              --- perform these changes but ensure your response is just a json object as outlined below

              The JSON should have the following structure:
              {
                "attacker_params": {
                  "vision_range": number (0-20),
                  "sound_radius": number (0-20),
                  "reaction": float (0.5-2.0)
                },
                "defender_params": {
                  "vision_range": number (0-20),
                  "sound_radius": number (0-20),
                  "reaction": float (0.5-2.0)
                },
                "columns": number,
                "rows": number,
                "grid": [[null, { "type": string, "orientation": 0 }, ...], [{ "type": string, "orientation": 0 }, null, ...], ...]
              }

              --- you should attempt to maintain the infomation from the original setup of the grid, only adding the things the user specifies
              --- so for example, if there are lots of walls in the initial grid, and the user tells you to add players, then the output grid should keep the walls as they were before, but introduce new players as the user describes
              
              Where:
              - attacker_params is an object describing attackers
              - defender_params is an object describing defenders
              - grid is a 2D array of nullable objects, where null represents an empty space, the type "player" is a player, the type "defender" is a defender, the type "wall" is a wall and "orientation" is by default 0 and is radians
              - columns is the length of grid and rows is the length of the subarrays of grid
              
              IT IS OF PARAMOUNT IMPORTANCE THAT YOU FOLLOW THE EXACT STRUCTURE GIVEN IN THIS MODEL, SACRIFICE WHATEVER IS NECESSARY TO ENSURE THAT YOUR RESPONSE FOLLOWS THE CORRECT JSON SHAPE`

      const encodedPrompt = encodeURIComponent(prompt);

      // Make the GET request to your Flask endpoint
      // const response = await fetch(`http://localhost:5000/ask-claude?prompt=${encodedPrompt}`, {
      //   method: 'GET',
      //   headers: {
      //     'Accept': 'application/json',
      //     'Content-Type': 'application/json'
      //   },
      // });

      const response = await fetch("http://127.0.0.1:5000/ask-claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      // Check if the response is OK
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response from Claude');
      }

      // Parse and return the response data
      const data = await response.json();
      console.log(data)
      const gridState = JSON.parse(data.response)
      console.log(gridState)

      setGridCols(gridState.columns)
      setGridRows(gridState.rows)
      setGrid(gridState.grid)
      setAttackerParams(gridState.attacker_params)
      setDefenderParams(gridState.defender_params)

      setGptInputValue("")
      setIsLoading(false)

    } catch (error) {
      console.error('Error querying Claude:', error);
      throw error;
    }
  }, [defenderParams, attackerParams, grid, gridCols, gridRows])

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    console.log("Prompt submitted:", gptInputValue);
    handleClaudeCall(gptInputValue)
  }

  return (
    <div className={`app-container ${isLoading ? 'loading' : ''}`}>
      <div className="toolbar">
        <h3>Tools</h3>
        <button
          className={`tool-button ${selectedTool === "player" ? "active" : ""}`}
          onClick={() => {
            setSelectedTool("player")
            setActiveRoutingPlayer(null);
          }}
        >
          Player
        </button>
        <button
          className={`tool-button ${selectedTool === "defender" ? "active" : ""
            }`}
          onClick={() => setSelectedTool("defender")}
        >
          Defender
        </button>
        <button
          className={`tool-button ${selectedTool === "wall" ? "active" : ""}`}
          onClick={() => setSelectedTool("wall")}
        >
          Wall
        </button>
        <button
          className={`tool-button ${selectedTool === "eraser" ? "active" : ""}`}
          onClick={() => setSelectedTool("eraser")}
        >
          Eraser
        </button>

        <button
          className={`tool-button ${selectedTool === "router" ? "active" : ""}`}
          onClick={() => {
            setSelectedTool("router");
            setActiveRoutingPlayer(null);
          }}
        >
          Router
        </button>

        <div className="slider-group">
          <label>
            Columns: {gridCols}
            <input
              type="range"
              min="5"
              max="40"
              value={gridCols}
              onChange={(e) => setGridCols(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="slider-group">
          <label>
            Rows: {gridRows}
            <input
              type="range"
              min="5"
              max="40"
              value={gridRows}
              onChange={(e) => setGridRows(Number(e.target.value))}
            />
          </label>
        </div>
        <hr />
        <h4>Attacker Parameters</h4>
        <div className="slider-group">
          <label>
            Vision Range: {attackerParams.vision_range}
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={attackerParams.vision_range}
              onChange={(e) =>
                setAttackerParams((prev) => ({
                  ...prev,
                  vision_range: Number(e.target.value),
                }))
              }
            />
          </label>
        </div>
        <div className="slider-group">
          <label>
            Sound Radius: {attackerParams.sound_radius}
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={attackerParams.sound_radius}
              onChange={(e) =>
                setAttackerParams((prev) => ({
                  ...prev,
                  sound_radius: Number(e.target.value),
                }))
              }
            />
          </label>
        </div>
        <div className="slider-group">
          <label>
            Reaction: {attackerParams.reaction}
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={attackerParams.reaction}
              onChange={(e) =>
                setAttackerParams((prev) => ({
                  ...prev,
                  reaction: Number(e.target.value),
                }))
              }
            />
          </label>
        </div>
        <hr />
        <h4>Defender Parameters</h4>
        <div className="slider-group">
          <label>
            Vision Range: {defenderParams.vision_range}
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={defenderParams.vision_range}
              onChange={(e) =>
                setDefenderParams((prev) => ({
                  ...prev,
                  vision_range: Number(e.target.value),
                }))
              }
            />
          </label>
        </div>
        <div className="slider-group">
          <label>
            Sound Radius: {defenderParams.sound_radius}
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={defenderParams.sound_radius}
              onChange={(e) =>
                setDefenderParams((prev) => ({
                  ...prev,
                  sound_radius: Number(e.target.value),
                }))
              }
            />
          </label>
        </div>
        <div className="slider-group">
          <label>
            Reaction: {defenderParams.reaction}
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={defenderParams.reaction}
              onChange={(e) =>
                setDefenderParams((prev) => ({
                  ...prev,
                  reaction: Number(e.target.value),
                }))
              }
            />
          </label>
        </div>
      </div>

      <div
        className="grid"
        ref={gridRef}
        onMouseUp={() => setIsMouseDown(false)}
        onMouseLeave={() => setIsMouseDown(false)}
        onMouseMove={handleMouseMove}
        style={{ position: 'relative' }}
      >
        {grid.map((row, rowIndex) => (
          <div key={rowIndex} className="grid-row">
            {row.map((cell, colIndex) => (
              <div
                key={colIndex}
                className="grid-cell"
                onMouseDown={() => handleMouseDown(rowIndex, colIndex)}
                onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
              >
                {renderCellContent(cell, rowIndex, colIndex)}
              </div>
            ))}
          </div>
        ))}
        <RouteLines />
      </div>

      <GetSimulation
        getGrid={processGridState}
        onSimulationResult={(result) => {
          setSimulationData({...result, 
            routes,
          });
          setShowSimulation(true);
        }}
      />

      {simulationData && showSimulation && (
        <div className="modal-overlay" onClick={() => setShowSimulation(false)}>
          <div
            className="simulation-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <SimulationPlayback simulationData={simulationData} />
            <button
              className="tool-button"
              onClick={() => setShowSimulation(false)}
            >
              Close Simulation
            </button>
          </div>
        </div>
      )}

      <div className="prompt-container">
        {isLoading ? (
          <div className="loading-spinner">
            Processing prompt...
          </div>
        ) : (
          <form className="prompt-form" onSubmit={handleSubmitForm}>
            <textarea
              type="text"
              className="prompt-input"
              value={gptInputValue}
              onChange={(e) => setGptInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();  // Prevent new line when Enter is pressed
                  handleSubmitForm(e);      // Submit the form manually
                }
              }}
              placeholder="Describe changes you'd like to make..."
            />
            <button type="submit" className="submit-button">
              Submit
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default App;
