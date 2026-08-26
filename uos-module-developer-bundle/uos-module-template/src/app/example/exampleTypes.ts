// ─── DB row ──────────────────────────────────────────────────────────────────

export interface ExampleItem {
  id: string;
  org_id: string;
  campus_id: string;
  title: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── Request bodies ───────────────────────────────────────────────────────────

export interface CreateExampleBody {
  title: string;
}

export interface UpdateExampleBody {
  title?: string;
  is_active?: boolean;
}
