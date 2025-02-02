import { useState } from "react"
import "./SimulationPlayback.css"
import { useEffect } from "react"
import { useCallback } from "react"

const LoadingIndicator = () => {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
        <div className="absolute inset-0 border-t-4 border-purple-500 rounded-full animate-spin"></div>
      </div>
    </div>
  )
}

const RecommendationDiv = ({data}) => {
  
}

const SimulationPlayback = ({ simulationData }) => {
  const mapData = simulationData.map
  const routes = simulationData.routes
  const gridRows = mapData.length
  const gridCols = mapData[0].length
  const states = simulationData.states
  const [currentTick, setCurrentTick] = useState(0)
  const [activeTab, setActiveTab] = useState("simulation")
  const [loading, setLoading] = useState(true)
  const [airecData, setAirecData] = useState({})
  console.log(states[0], simulationData.map)
  const currentState = states[currentTick]

  const fetchData = useCallback(async () => {
    try {
      const prompt = `
              the current json representation of our simulation looks like this:
              {
                "columns": ${gridCols},
                "rows": ${gridRows},
                "routes": ${JSON.stringify(routes)}
                "data": ${JSON.stringify(states[states.length - 1])}
              }

              i want you to take the simulation output in the data into account, and in return change the routes that the players followed, to something you think would give more successful results for the player
              the format of the routes is as follows:
              routes: {
                "{ROW}-{COL}": [{row: number, col: number}, ...]
              }

              take into account that each row col entry should map to a player, you can have as many entries in the array as you like, but try keep it to less than 5
              the json output should have the same structure as the input json
              
              IT IS OF PARAMOUNT IMPORTANCE THAT YOU FOLLOW THE EXACT STRUCTURE GIVEN IN THIS MODEL, SACRIFICE WHATEVER IS NECESSARY TO ENSURE THAT YOUR RESPONSE FOLLOWS THE CORRECT JSON SHAPE`

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
      setAirecData(gridState)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  const grid = Array.from({ length: gridRows }, () =>
    Array.from({ length: gridCols }, () => ({ attackers: [], defenders: [] })),
  )

  currentState.attackers.forEach((attacker) => {
    if (attacker.x >= 0 && attacker.x < gridCols && attacker.y >= 0 && attacker.y < gridRows) {
      grid[attacker.y][attacker.x].attackers.push(attacker)
    }
  })

  currentState.defenders.forEach((defender) => {
    if (defender.x >= 0 && defender.x < gridCols && defender.y >= 0 && defender.y < gridRows) {
      grid[defender.y][defender.x].defenders.push(defender)
    }
  })

  const renderEntity = (entity, type) => {
    const baseEmoji = entity.alive ? (type === "attacker" ? "👮" : "🦹") : "💀"
    const angleDeg = (entity.orientation * 180) / Math.PI
    return (
      <div key={`${type}-${entity.id}`} className={`entity ${type} ${entity.alive ? "" : "dead"}`}>
        {baseEmoji}
        {entity.alive && (
          <span className="viewport-arrow" style={{ transform: `rotate(${angleDeg}deg)` }}>
            ➤
          </span>
        )}
      </div>
    )
  }

  const renderCellContent = (cell, row, col) => {
    if (mapData[row][col] === 1) {
      return "🟦"
    }
    return (
      <div className="cell-content">
        {cell.attackers.map((attacker) => renderEntity(attacker, "attacker"))}
        {cell.defenders.map((defender) => renderEntity(defender, "defender"))}
      </div>
    )
  }

  const renderSummaryTable = () => {
    return (
      <div>
        <table className="summary-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total Ticks</td>
              <td>{states.length}</td>
            </tr>
            <tr>
              <td>Outcome</td>
              <td>{simulationData.outcome.attackers_win ? "Attackers Win" : "Defenders Win"}</td>
            </tr>
            <tr>
              <td>Initial Attackers</td>
              <td>{states[0].attackers.length}</td>
            </tr>
            <tr>
              <td>Initial Defenders</td>
              <td>{states[0].defenders.length}</td>
            </tr>
            <tr>
              <td>Surviving Attackers</td>
              <td>{states[states.length - 1].attackers.filter((a) => a.alive).length}</td>
            </tr>
            <tr>
              <td>Surviving Defenders</td>
              <td>{states[states.length - 1].defenders.filter((d) => d.alive).length}</td>
            </tr>
          </tbody>
        </table>
        {loading ? (
          <LoadingIndicator/>
        ) : (
          <div>
            <div className="grid">
            {grid.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="grid-row">
                {row.map((cell, colIndex) => (
                  <div key={`cell-${rowIndex}-${colIndex}`} className="grid-cell">
                    {renderCellContent(cell, rowIndex, colIndex)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <RecommendationDiv data={airecData}/>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="sim-container">
      <div className="tabs">
        <div
          className={`tab-button ${activeTab === "simulation" ? "active" : ""}`}
          onClick={() => setActiveTab("simulation")}
        >
          <h2>Simulation</h2>
        </div>
        <div
          className={`tab-button ${activeTab === "summary" ? "active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          <h2>Summary</h2>
        </div>
      </div>
      {activeTab === "summary" ? (
        <div className="summary-container">
          <h3>Simulation Summary</h3>
          {renderSummaryTable()}
        </div>
      ) : (
        <div className="innerrow">
          <div className="toolbar">
            <h3>Simulation Playback</h3>
            <div className="slider-group">
              <label>
                Tick: {currentTick}
                <input
                  type="range"
                  min="0"
                  max={states.length - 1}
                  value={currentTick}
                  onChange={(e) => setCurrentTick(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="outcome">
              Outcome: {simulationData.outcome.attackers_win ? "Attackers Win" : "Defenders Win"}
            </div>
          </div>

          <div className="grid">
            {grid.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="grid-row">
                {row.map((cell, colIndex) => (
                  <div key={`cell-${rowIndex}-${colIndex}`} className="grid-cell">
                    {renderCellContent(cell, rowIndex, colIndex)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SimulationPlayback

