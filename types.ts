export interface PathNode {
  id: string;
  x: number; // 0-100 coordinate space
  y: number; // 0-100 coordinate space
  level: number; // Vertical elevation layer
  intensity: number; // 0-100 scale
  label?: string;
  image?: string; // Base64 data URL
}

export interface GeneratedScenario {
  nodes: {
    description: string;
    intensity: number;
  }[];
}

export interface PathVariation {
  id: string;
  name: string;
  color: string;
  nodes: PathNode[]; // The reordered list of nodes
}