/**
 * Well-known Foundry service identifiers used as the `service` segment in RIDs.
 *
 * These correspond to first-party platform services. Third-party or unknown
 * services are still valid — this map simply provides discoverable constants.
 */
export const KnownServices = {
  /** Compass — resource catalog and metadata graph */
  COMPASS: "compass",
  /** Ontology — type system and object definitions */
  ONTOLOGY: "ontology",
  /** Phonograph2 Objects — object storage backend */
  PHONOGRAPH2_OBJECTS: "phonograph2-objects",
  /** Highbury — compute cluster management */
  HIGHBURY: "highbury",
  /** Apollo — environment and deployment management */
  APOLLO: "apollo",
  /** Multipass — identity and access management */
  MULTIPASS: "multipass",
  /** Blobster — binary / blob storage */
  BLOBSTER: "blobster",
  /** Mio — media and file I/O */
  MIO: "mio",
  /** Datasets — dataset management */
  DATASETS: "datasets",
  /** Stemma — data lineage and provenance */
  STEMMA: "stemma",
  /** Monocle — monitoring and alerting */
  MONOCLE: "monocle",
  /** Foundry ML — machine learning pipelines */
  FOUNDRY_ML: "foundry-ml",
  /** Contour — analytics and visualization */
  CONTOUR: "contour",
  /** Slate — application builder */
  SLATE: "slate",
  /** Workshop — low-code application framework */
  WORKSHOP: "workshop",
  /** Pipeline Builder — data pipeline orchestration */
  PIPELINE_BUILDER: "pipeline-builder",
  /** Quiver — real-time streaming */
  QUIVER: "quiver",
  /** Notepad — collaborative documents */
  NOTEPAD: "notepad",
  /** Carbon — code workbooks */
  CARBON: "carbon",
} as const;

/** Union of all known service identifier strings. */
export type KnownService = (typeof KnownServices)[keyof typeof KnownServices];
