export const DEFAULT_PROJECT_GROUP = "default";
export const NEW_PROJECT_GROUP_OPTION = "__new_project__";
export const ALL_PROJECT_GROUPS_OPTION = "__all_projects__";

export interface ProjectGroupRecord {
  projectGroup?: string | null;
}

export function normalizeProjectGroupName(value?: string | null): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : DEFAULT_PROJECT_GROUP;
}

export function collectProjectGroupNames(projects: ProjectGroupRecord[]): string[] {
  const groups = new Set<string>([DEFAULT_PROJECT_GROUP]);

  for (const project of projects) {
    groups.add(normalizeProjectGroupName(project.projectGroup));
  }

  const nonDefault = Array.from(groups)
    .filter((group) => group !== DEFAULT_PROJECT_GROUP)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return [DEFAULT_PROJECT_GROUP, ...nonDefault];
}
