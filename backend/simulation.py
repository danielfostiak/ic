import random
import math
import json

# -------------------------
# Helper: Bresenham Line Algorithm
# -------------------------
def bresenham_line(x0, y0, x1, y1):
    points = []
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    x, y = x0, y0
    sx = -1 if x0 > x1 else 1
    sy = -1 if y0 > y1 else 1
    if dx > dy:
        err = dx / 2.0
        while x != x1:
            points.append((x, y))
            err -= dy
            if err < 0:
                y += sy
                err += dx
            x += sx
    else:
        err = dy / 2.0
        while y != y1:
            points.append((x, y))
            err -= dx
            if err < 0:
                x += sx
                err += dy
            y += sy
    points.append((x1, y1))
    return points

# -------------------------
# Map / Building Class
# -------------------------
class Map:
    def __init__(self, grid):
        self.grid = grid
        self.height = len(grid)
        self.width = len(grid[0]) if self.height > 0 else 0

    def is_free(self, x, y):
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.grid[y][x] == 0
        return False

    def get_random_free_cell(self):
        free_cells = [(x, y) for y in range(self.height) for x in range(self.width) if self.is_free(x, y)]
        if not free_cells:
            raise ValueError("No free cells available on the map.")
        return random.choice(free_cells)

# -------------------------
# Strategy Class for Attackers
# -------------------------
class Strategy:
    def __init__(self, attacker_positions):
        self.attacker_positions = attacker_positions

    def get_attacker_positions(self):
        return self.attacker_positions

# Default parameter dictionaries.
DEFAULT_ATTACKER_PARAMS = {
    "vision_range": 5,
    "sound_radius": 4,
    "view_angle": math.pi/4,
    "reaction": 1.0,
}
DEFAULT_DEFENDER_PARAMS = {
    "vision_range": 4,
    "sound_radius": 4,
    "view_angle": math.pi/4,
    "reaction": 1.0,
}

# -------------------------
# Agent Classes
# -------------------------
class Agent:
    def __init__(self, id, x, y, vision_range=3, orientation=0, view_angle=math.pi/4, sound_radius=3):
        self.id = id
        self.x = x
        self.y = y
        self.vision_range = vision_range
        self.orientation = orientation
        self.view_angle = view_angle
        self.sound_radius = sound_radius
        self.alive = True

    def position(self):
        return (self.x, self.y)

    def distance_to(self, other):
        dx = other.x - self.x
        dy = other.y - self.y
        return math.sqrt(dx * dx + dy * dy)

    def line_of_sight_clear(self, other, game_map):
        line = bresenham_line(self.x, self.y, other.x, other.y)
        for (cx, cy) in line[1:]:
            if not game_map.is_free(cx, cy):
                return False
        return True

    def can_see(self, other, game_map, epsilon=1e-6):
        if not other.alive:
            return False
        dx = other.x - self.x
        dy = other.y - self.y
        distance = math.sqrt(dx*dx + dy*dy)
        if distance > self.vision_range:
            return False
        angle_to_other = math.atan2(dy, dx)
        angle_diff = abs((angle_to_other - self.orientation + math.pi) % (2*math.pi) - math.pi)
        if angle_diff > self.view_angle + epsilon:
            return False
        if not self.line_of_sight_clear(other, game_map):
            return False
        return True

    def can_hear(self, other):
        if not other.alive:
            return False
        return self.distance_to(other) <= self.sound_radius

    def move_to(self, x, y):
        dx = x - self.x
        dy = y - self.y
        if dx or dy:
            self.orientation = math.atan2(dy, dx)
        self.x = x
        self.y = y

    def move_randomly(self, game_map):
        directions = [(0,1), (0,-1), (1,0), (-1,0)]
        random.shuffle(directions)
        for dx, dy in directions:
            new_x = self.x + dx
            new_y = self.y + dy
            if game_map.is_free(new_x, new_y):
                self.move_to(new_x, new_y)
                break

    def move_towards(self, target_x, target_y, game_map):
        best_move = None
        best_dist = float("inf")
        directions = [(0,1), (0,-1), (1,0), (-1,0)]
        random.shuffle(directions)
        for dx, dy in directions:
            new_x = self.x + dx
            new_y = self.y + dy
            if game_map.is_free(new_x, new_y):
                dist = math.sqrt((target_x - new_x)**2 + (target_y - new_y)**2)
                if dist < best_dist:
                    best_dist = dist
                    best_move = (new_x, new_y)
        if best_move:
            self.move_to(*best_move)

class Attacker(Agent):
    def __init__(self, id, x, y, params={}):
        vision_range = params.get("vision_range", DEFAULT_ATTACKER_PARAMS["vision_range"])
        view_angle = params.get("view_angle", DEFAULT_ATTACKER_PARAMS["view_angle"])
        sound_radius = params.get("sound_radius", DEFAULT_ATTACKER_PARAMS["sound_radius"])
        orientation = params.get("orientation", random.uniform(0, 2*math.pi))
        super().__init__(id, x, y, vision_range, orientation, view_angle, sound_radius)
        self.reaction = params.get("reaction", DEFAULT_ATTACKER_PARAMS["reaction"])
        self.visited = {(x, y)}
        self.score = 0

    def move_to(self, x, y):
        old_pos = self.position()
        super().move_to(x, y)
        if (x, y) not in self.visited:
            self.visited.add((x, y))
            self.score += 1

class Defender(Agent):
    def __init__(self, id, x, y, params={}):
        vision_range = params.get("vision_range", DEFAULT_DEFENDER_PARAMS["vision_range"])
        view_angle = params.get("view_angle", DEFAULT_DEFENDER_PARAMS["view_angle"])
        sound_radius = params.get("sound_radius", DEFAULT_DEFENDER_PARAMS["sound_radius"])
        orientation = params.get("orientation", random.uniform(0, 2*math.pi))
        super().__init__(id, x, y, vision_range, orientation, view_angle, sound_radius)
        self.reaction = params.get("reaction", DEFAULT_DEFENDER_PARAMS["reaction"])

class Simulation:
    def __init__(self, game_map, attacker_strategy, defender_positions, attacker_params=None, defender_params=None):
        self.map = game_map
        self.strategy = attacker_strategy
        self.attackers = []
        self.defenders = []
        self.tick = 0

        if attacker_params is None:
            attacker_params = DEFAULT_ATTACKER_PARAMS.copy()
        if defender_params is None:
            defender_params = DEFAULT_DEFENDER_PARAMS.copy()

        attacker_positions = self.strategy.get_attacker_positions()
        for i, pos in enumerate(attacker_positions):
            if isinstance(pos, (list, tuple)) and len(pos) >= 2:
                x, y = pos[0], pos[1]
                orientation = pos[2] if len(pos) >= 3 else random.uniform(0, 2*math.pi)
            else:
                raise ValueError("Invalid attacker position")
            params = attacker_params.copy()
            params["orientation"] = orientation
            self.attackers.append(Attacker(id=i, x=x, y=y, params=params))

        for i, pos in enumerate(defender_positions):
            if isinstance(pos, (list, tuple)) and len(pos) >= 2:
                x, y = pos[0], pos[1]
                orientation = pos[2] if len(pos) >= 3 else random.uniform(0, 2*math.pi)
            else:
                raise ValueError("Invalid defender position")
            if any(a.x == x and a.y == y for a in self.attackers):
                raise ValueError(f"Defender starting cell ({x}, {y}) collides with an attacker.")
            params = defender_params.copy()
            params["orientation"] = orientation
            self.defenders.append(Defender(id=i, x=x, y=y, params=params))

        self.states = []

    def attackers_alive(self):
        return any(a.alive for a in self.attackers)

    def defenders_alive(self):
        return any(d.alive for d in self.defenders)

    def get_state(self):
        return {
            "tick": self.tick,
            "attackers": [
                {"id": a.id, "x": a.x, "y": a.y, "alive": a.alive, "score": a.score, "orientation": a.orientation}
                for a in self.attackers
            ],
            "defenders": [
                {"id": d.id, "x": d.x, "y": d.y, "alive": d.alive, "orientation": d.orientation}
                for d in self.defenders
            ]
        }

    def run(self):
        self.states.append(self.get_state())
        while self.attackers_alive() and self.defenders_alive():
            self.tick += 1
            self.update()
            self.states.append(self.get_state())
        outcome = {"attackers_win": not self.defenders_alive()}
        return {"map": self.map.grid, "states": self.states, "outcome": outcome}

    def update(self):
        engaged_attackers = set()
        engaged_defenders = set()

        # Attackers Engagement Phase
        for attacker in self.attackers:
            if not attacker.alive or attacker.id in engaged_attackers:
                continue
            visible_defenders = [d for d in self.defenders if d.alive and d.id not in engaged_defenders and attacker.can_see(d, self.map)]
            if visible_defenders:
                defender = min(visible_defenders, key=lambda d: attacker.distance_to(d))
                if defender.can_see(attacker, self.map):
                    a_reaction = random.uniform(0, attacker.reaction)
                    d_reaction = random.uniform(0, defender.reaction)
                    if a_reaction < d_reaction:
                        defender.alive = False
                        attacker.score += 5
                    else:
                        attacker.alive = False
                        attacker.score -= 10
                    engaged_attackers.add(attacker.id)
                    engaged_defenders.add(defender.id)
                else:
                    defender.alive = False
                    attacker.score += 5
                    engaged_attackers.add(attacker.id)
                    engaged_defenders.add(defender.id)
        # Defenders Engagement Phase
        for defender in self.defenders:
            if not defender.alive or defender.id in engaged_defenders:
                continue
            visible_attackers = [a for a in self.attackers if a.alive and a.id not in engaged_attackers and defender.can_see(a, self.map)]
            if visible_attackers:
                attacker = min(visible_attackers, key=lambda a: defender.distance_to(a))
                if not attacker.can_see(defender, self.map):
                    attacker.alive = False
                    attacker.score -= 10
                    engaged_defenders.add(defender.id)
                    engaged_attackers.add(attacker.id)
        # Movement Phase for Attackers
        for attacker in self.attackers:
            if not attacker.alive:
                continue
            if any(attacker.can_see(d, self.map) for d in self.defenders if d.alive):
                continue
            heard_defenders = [d for d in self.defenders if d.alive and attacker.can_hear(d)]
            if heard_defenders:
                nearest = min(heard_defenders, key=lambda d: attacker.distance_to(d))
                dx = attacker.x - nearest.x
                dy = attacker.y - nearest.y
                move_dx = 1 if dx > 0 else -1 if dx < 0 else 0
                move_dy = 1 if dy > 0 else -1 if dy < 0 else 0
                new_x = attacker.x + move_dx
                new_y = attacker.y + move_dy
                if self.map.is_free(new_x, new_y):
                    attacker.move_to(new_x, new_y)
                else:
                    attacker.move_randomly(self.map)
            else:
                attacker.move_randomly(self.map)
        # Movement Phase for Defenders
        for defender in self.defenders:
            if not defender.alive:
                continue
            heard_attackers = [a for a in self.attackers if a.alive and defender.can_hear(a)]
            if heard_attackers:
                nearest = min(heard_attackers, key=lambda a: defender.distance_to(a))
                defender.move_towards(nearest.x, nearest.y, self.map)
            else:
                defender.move_randomly(self.map)

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from collections import deque
import random

class AttackerNet(nn.Module):
    def __init__(self, state_size, action_size):
        super(AttackerNet, self).__init__()
        self.fc1 = nn.Linear(state_size, 128)
        self.fc2 = nn.Linear(128, 64)
        self.fc3 = nn.Linear(64, action_size)
        
    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return self.fc3(x)

class RLTrainer:
    def __init__(self, game_map, defender_positions):
        self.game_map = game_map
        self.defender_positions = defender_positions
        
        # RL Parameters
        self.gamma = 0.99
        self.epsilon = 1.0
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.learning_rate = 0.0001
        self.batch_size = 32
        self.memory = deque(maxlen=10000)
        
        self.vision_range = DEFAULT_ATTACKER_PARAMS["vision_range"]
        self.local_map_size = (2 * self.vision_range + 1) ** 2
        self.defender_state_size = 3 * len(self.defender_positions)
        self.state_size = self.defender_state_size + self.local_map_size
        
        self.action_size = 4  # up, down, left, right
        
        self.model = AttackerNet(self.state_size, self.action_size)
        self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)
        self.criterion = nn.MSELoss()

    def _is_valid_position(self, x, y):
        # Check if position is within bounds and is a free cell
        if not (0 <= x < self.game_map.width and 0 <= y < self.game_map.height):
            return False
        if not self.game_map.is_free(x, y):
            return False
            
        # Check if position collides with any defender position
        for dx, dy in self.defender_positions:
            if x == dx and y == dy:
                return False
                
        return True

    def _get_random_valid_position(self):
        valid_positions = []
        for y in range(self.game_map.height):
            for x in range(self.game_map.width):
                if self._is_valid_position(x, y):
                    valid_positions.append((x, y))
        
        if not valid_positions:
            raise ValueError("No valid positions available for attacker placement")
            
        return random.choice(valid_positions)

    def _get_state(self, simulation):
        state = np.zeros(self.state_size)
        
        for i, defender in enumerate(simulation.defenders):
            base_idx = i * 3
            if base_idx + 2 < self.defender_state_size:  # Safety check
                state[base_idx] = defender.x / simulation.map.width
                state[base_idx + 1] = defender.y / simulation.map.height
                state[base_idx + 2] = float(defender.alive)
        
        attacker = next((a for a in simulation.attackers if a.alive), None)
        if attacker:
            local_map = np.ones(self.local_map_size)  # Default to walls
            idx = 0
            for dy in range(-self.vision_range, self.vision_range + 1):
                for dx in range(-self.vision_range, self.vision_range + 1):
                    new_x, new_y = attacker.x + dx, attacker.y + dy
                    if 0 <= new_x < simulation.map.width and 0 <= new_y < simulation.map.height:
                        local_map[idx] = float(simulation.map.grid[new_y][new_x])
                    idx += 1
            state[self.defender_state_size:] = local_map
        
        return state

    def _calculate_reward(self, simulation, attacker):
        reward = 0
        
        if attacker.alive:
            reward += 1
        else:
            reward -= 10
            
        dead_defenders = sum(1 for d in simulation.defenders if not d.alive)
        reward += dead_defenders * 5
        
        reward += attacker.score * 0.1
        
        return reward

    def train_episode(self):
        x, y = self._get_random_valid_position()
        attacker_positions = [(x, y)]
        
        strategy = Strategy(attacker_positions)
        simulation = Simulation(self.game_map, strategy, self.defender_positions)
        
        total_reward = 0
        done = False
        
        while not done:
            state = self._get_state(simulation)
            
            if random.random() < self.epsilon:
                action = random.randrange(self.action_size)
            else:
                with torch.no_grad():
                    state_tensor = torch.FloatTensor(state).unsqueeze(0)
                    action = torch.argmax(self.model(state_tensor)).item()
            
            # Convert action to movement
            moves = [(0, 1), (0, -1), (1, 0), (-1, 0)]
            dx, dy = moves[action]
            
            attacker = next((a for a in simulation.attackers if a.alive), None)
            if attacker:
                new_x = attacker.x + dx
                new_y = attacker.y + dy
                if simulation.map.is_free(new_x, new_y):
                    attacker.move_to(new_x, new_y)
            
            simulation.update()
            
            reward = self._calculate_reward(simulation, attacker) if attacker else -10
            total_reward += reward
            done = not simulation.attackers_alive() or not simulation.defenders_alive()
            next_state = self._get_state(simulation)
            
            self.memory.append((state, action, reward, next_state, done))
            
            if len(self.memory) >= self.batch_size:
                self._train_batch()
        
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)
        
        return total_reward

    def _train_batch(self):
        batch = random.sample(self.memory, self.batch_size)
        
        states = np.array([transition[0] for transition in batch])
        actions = np.array([transition[1] for transition in batch])
        rewards = np.array([transition[2] for transition in batch])
        next_states = np.array([transition[3] for transition in batch])
        dones = np.array([transition[4] for transition in batch])
        
        states = torch.FloatTensor(states)
        actions = torch.LongTensor(actions)
        rewards = torch.FloatTensor(rewards)
        next_states = torch.FloatTensor(next_states)
        dones = torch.FloatTensor(dones)
        
        # Compute Q values
        current_q_values = self.model(states).gather(1, actions.unsqueeze(1))
        next_q_values = self.model(next_states).max(1)[0].detach()
        target_q_values = rewards + (1 - dones) * self.gamma * next_q_values
        
        # Compute loss and update
        loss = self.criterion(current_q_values.squeeze(), target_q_values)
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

    def train(self, num_episodes):
        rewards_history = []
        
        for episode in range(num_episodes):
            reward = self.train_episode()
            rewards_history.append(reward)
            
            if episode % 100 == 0:
                avg_reward = np.mean(rewards_history[-100:] if len(rewards_history) >= 100 else rewards_history)
                print(f"Episode {episode}, Average Reward: {avg_reward:.2f}, Epsilon: {self.epsilon:.2f}")
        
        return rewards_history

    def save_model(self, path):
        torch.save(self.model.state_dict(), path)

    def load_model(self, path):
        self.model.load_state_dict(torch.load(path))

if __name__ == "__main__":
    grid = [
        [0,0,0,0,0,0,0,0,0,0],
        [0,0,1,1,1,1,1,1,0,0],
        [0,0,0,0,0,0,0,0,0,0],
        [0,0,0,1,0,0,1,1,0,0],
        [0,0,0,1,0,0,1,0,0,0],
        [0,1,1,1,0,0,1,0,0,0],
        [0,0,0,1,0,0,1,0,0,0],
        [0,0,0,0,0,0,0,0,0,0],
        [0,1,1,1,0,1,1,1,1,0],
        [0,0,0,0,0,0,0,0,0,0],
    ]
    game_map = Map(grid)
    defender_positions = [(3,7), (2,7), (8,6)]
    
    trainer = RLTrainer(game_map, defender_positions)
    rewards = trainer.train(10000)
    trainer.save_model("attacker_model.pth")
    
