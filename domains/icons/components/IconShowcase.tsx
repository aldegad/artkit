"use client";

import { useState, useMemo } from "react";
import { Scrollbar } from "@/shared/components";
import { iconRegistry, CATEGORY_LABELS } from "../data/iconRegistry";
import type { IconCategory } from "../types";
import { IconCard } from "./IconCard";

export function IconShowcase() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<IconCategory | "all">("all");

  const categories = useMemo(() => {
    const cats = Object.keys(CATEGORY_LABELS) as IconCategory[];
    return cats;
  }, []);

  const filteredIcons = useMemo(() => {
    let icons = iconRegistry;

    if (activeCategory !== "all") {
      icons = icons.filter((icon) => icon.category === activeCategory);
    }

    if (search.trim()) {
      const query = search.toLowerCase().trim();
      icons = icons.filter(
        (icon) =>
          icon.name.toLowerCase().includes(query) ||
          icon.tags.some((tag) => tag.includes(query))
      );
    }

    return icons;
  }, [activeCategory, search]);

  const groupedIcons = useMemo(() => {
    if (activeCategory !== "all") {
      return [{ category: activeCategory, icons: filteredIcons }];
    }

    const groups: { category: IconCategory; icons: typeof filteredIcons }[] = [];
    const categoryOrder = Object.keys(CATEGORY_LABELS) as IconCategory[];

    for (const cat of categoryOrder) {
      const icons = filteredIcons.filter((icon) => icon.category === cat);
      if (icons.length > 0) {
        groups.push({ category: cat, icons });
      }
    }

    return groups;
  }, [activeCategory, filteredIcons]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default bg-surface-secondary shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search icons..."
            className="w-full px-3 py-1.5 bg-surface-primary border border-border-default rounded-lg text-sm focus:outline-none focus:border-accent-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              ×
            </button>
          )}
        </div>

        {/* Total count */}
        <span className="text-xs text-text-tertiary whitespace-nowrap">
          {filteredIcons.length} / {iconRegistry.length} icons
        </span>
      </div>

      {/* Category filters */}
      <Scrollbar
        className="border-b border-border-default bg-surface-primary shrink-0"
        overflow={{ x: "scroll", y: "hidden" }}
      >
        <div className="flex items-center gap-1 px-4 py-2 min-w-max">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              activeCategory === "all"
                ? "bg-accent-primary text-white"
                : "bg-surface-tertiary text-text-secondary hover:bg-interactive-hover"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? "bg-accent-primary text-white"
                  : "bg-surface-tertiary text-text-secondary hover:bg-interactive-hover"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </Scrollbar>

      {/* Icon Grid */}
      <Scrollbar className="flex-1 min-h-0" overflow={{ x: "hidden", y: "scroll" }}>
        <div className="p-4">
          {filteredIcons.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-text-tertiary text-sm">
              No icons found for &quot;{search}&quot;
            </div>
          ) : (
            <div className="space-y-6">
              {groupedIcons.map((group) => (
                <div key={group.category}>
                  <h3 className="text-sm font-medium text-text-secondary mb-3">
                    {CATEGORY_LABELS[group.category]}
                    <span className="text-text-tertiary font-normal ml-2">
                      ({group.icons.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
                    {group.icons.map((icon) => (
                      <IconCard key={icon.name} icon={icon} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Scrollbar>
    </div>
  );
}
