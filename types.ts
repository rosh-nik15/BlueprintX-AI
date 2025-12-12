export interface Point2D {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;
  type: 'brick' | 'drywall' | 'glass';
}

export interface Door {
  id: string;
  position: Point2D;
  width: number;
  rotation: number; // in degrees
}

export interface Room {
  id: string;
  name: string;
  polygon: Point2D[];
  areaSqFt: number;
  center: Point2D;
  suggestedColor?: string;
  colorDescription?: string;
}

export interface MaterialItem {
  item: string;
  quantity: string;
  unit: string;
  estimated_cost: string;
  basis_of_calculation: string;
}

export interface RenovationItem {
  detected_issue: string;
  recommended_action: string;
  benefit: string;
}

export interface SafetyWarning {
  type: string;
  location: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  recommended_fix: string;
}

export interface ElectricalPlumbing {
  electrical: {
    wiring_length: string;
    switchboard_positions: string[];
    socket_positions: string[];
    load_distribution: string;
  };
  plumbing: {
    pipe_routes: string[];
    pipe_sizes: string;
    wet_area_notes: string;
  };
  safety_warnings: SafetyWarning[];
}

export interface BlueprintAnalysis {
  walls: Wall[];
  doors: Door[];
  rooms: Room[];
  material_cost_estimation: {
    materials: MaterialItem[];
    total_estimated_cost: string;
  };
  renovation_recommendations: RenovationItem[];
  electrical_plumbing_safety: ElectricalPlumbing;
  summary: string;
}