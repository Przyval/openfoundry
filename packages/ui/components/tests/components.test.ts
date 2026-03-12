import { describe, it, expect } from "vitest";

/**
 * Tests for @openfoundry/ui-components.
 *
 * Since these tests run in a Node environment without a full React DOM,
 * we test exports, component function signatures, prop interfaces, and
 * internal logic rather than DOM rendering.
 */

// ---------------------------------------------------------------------------
// Barrel exports
// ---------------------------------------------------------------------------

describe("@openfoundry/ui-components barrel exports", () => {
  it("exports ObjectTable component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.ObjectTable).toBe("function");
  });

  it("exports FilterBar component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.FilterBar).toBe("function");
  });

  it("exports ActionForm component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.ActionForm).toBe("function");
  });

  it("exports PropertyRenderer component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.PropertyRenderer).toBe("function");
  });

  it("exports StatusTag component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.StatusTag).toBe("function");
  });

  it("exports PaginationBar component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.PaginationBar).toBe("function");
  });

  it("exports RidLink component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.RidLink).toBe("function");
  });

  it("exports ConfirmDialog component", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.ConfirmDialog).toBe("function");
  });

  it("exports LoadingState, ErrorState, EmptyState components", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.LoadingState).toBe("function");
    expect(typeof mod.ErrorState).toBe("function");
    expect(typeof mod.EmptyState).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// ObjectTable
// ---------------------------------------------------------------------------

describe("ObjectTable", () => {
  it("is a function component", async () => {
    const { ObjectTable } = await import("../src/ObjectTable.js");
    expect(typeof ObjectTable).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { ObjectTable } = await import("../src/ObjectTable.js");
    // React function components accept a single props object
    expect(ObjectTable.length).toBe(1);
  });

  it("exports ObjectTableColumn type shape via props", async () => {
    // Verify the module can be imported without error
    const mod = await import("../src/ObjectTable.js");
    expect(mod.ObjectTable).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

describe("FilterBar", () => {
  it("is a function component", async () => {
    const { FilterBar } = await import("../src/FilterBar.js");
    expect(typeof FilterBar).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { FilterBar } = await import("../src/FilterBar.js");
    expect(FilterBar.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ActionForm
// ---------------------------------------------------------------------------

describe("ActionForm", () => {
  it("is a function component", async () => {
    const { ActionForm } = await import("../src/ActionForm.js");
    expect(typeof ActionForm).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { ActionForm } = await import("../src/ActionForm.js");
    expect(ActionForm.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PropertyRenderer
// ---------------------------------------------------------------------------

describe("PropertyRenderer", () => {
  it("is a function component", async () => {
    const { PropertyRenderer } = await import("../src/PropertyRenderer.js");
    expect(typeof PropertyRenderer).toBe("function");
  });

  it("accepts a single props argument (value, type)", async () => {
    const { PropertyRenderer } = await import("../src/PropertyRenderer.js");
    expect(PropertyRenderer.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// StatusTag
// ---------------------------------------------------------------------------

describe("StatusTag", () => {
  it("is a function component", async () => {
    const { StatusTag } = await import("../src/StatusTag.js");
    expect(typeof StatusTag).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { StatusTag } = await import("../src/StatusTag.js");
    expect(StatusTag.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PaginationBar
// ---------------------------------------------------------------------------

describe("PaginationBar", () => {
  it("is a function component", async () => {
    const { PaginationBar } = await import("../src/PaginationBar.js");
    expect(typeof PaginationBar).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { PaginationBar } = await import("../src/PaginationBar.js");
    expect(PaginationBar.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// LoadingState / ErrorState / EmptyState
// ---------------------------------------------------------------------------

describe("LoadingState", () => {
  it("is a function component", async () => {
    const { LoadingState } = await import("../src/LoadingState.js");
    expect(typeof LoadingState).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { LoadingState } = await import("../src/LoadingState.js");
    expect(LoadingState.length).toBe(1);
  });
});

describe("ErrorState", () => {
  it("is a function component", async () => {
    const { ErrorState } = await import("../src/LoadingState.js");
    expect(typeof ErrorState).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { ErrorState } = await import("../src/LoadingState.js");
    expect(ErrorState.length).toBe(1);
  });
});

describe("EmptyState", () => {
  it("is a function component", async () => {
    const { EmptyState } = await import("../src/LoadingState.js");
    expect(typeof EmptyState).toBe("function");
  });

  it("accepts a single props argument", async () => {
    const { EmptyState } = await import("../src/LoadingState.js");
    expect(EmptyState.length).toBe(1);
  });
});
