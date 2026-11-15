export type Point = { x: number; y: number };
export type DropOperation = {
  type: 'drop';
  id: string;
  center: Point;
  radius: number;
  color: string;
  durationMs: number;
};
export type StrokeOperation = {
  type: 'stroke';
  id: string;
  points: Point[];
  radius: number;
  strength: number;
};
export type Operation =
  | DropOperation
  | StrokeOperation
  | { type: 'clear'; id: string; baseColor: string };

export type DocumentState = {
  schemaVersion: 1;
  width: number;
  height: number;
  baseColor: string;
  operations: Operation[];
};

export type Tool = 'drop' | 'stroke' | 'pan';
export type EngineStatus = {
  isAnimating: boolean;
  queuedDrops: number;
  operations: number;
  fps: number;
  canUndo: boolean;
  canRedo: boolean;
  isStroking: boolean;
  contextLost: boolean;
};
