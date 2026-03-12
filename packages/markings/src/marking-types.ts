export enum MarkingType {
  MANDATORY = "MANDATORY",
  DISCRETIONARY = "DISCRETIONARY",
}

export interface Marking {
  rid: string;
  markingId: string;
  displayName: string;
  type: MarkingType;
  category: string;
  description?: string;
}

export interface MarkingCategory {
  categoryId: string;
  displayName: string;
  markingType: MarkingType;
  markings: Marking[];
}

export enum ClassificationLevel {
  UNCLASSIFIED = "UNCLASSIFIED",
  CONFIDENTIAL = "CONFIDENTIAL",
  SECRET = "SECRET",
  TOP_SECRET = "TOP_SECRET",
}

export interface SecurityClassification {
  level: ClassificationLevel;
  compartments: string[];
  releasableTo: string[];
}
