import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JailFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  categories: string[];
}

export function JailFilters({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  statusFilter,
  onStatusChange,
  categories,
}: JailFiltersProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search jails..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="terminal-input pl-10 font-mono"
        />
      </div>
      <div className="flex gap-2">
        <Select value={categoryFilter} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-[140px] terminal-input font-mono text-sm">
            <Filter className="mr-2 h-3 w-3" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="terminal-card border-border">
            <SelectItem value="all" className="font-mono">
              All Categories
            </SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="font-mono">
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[130px] terminal-input font-mono text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="terminal-card border-border">
            <SelectItem value="all" className="font-mono">
              All Status
            </SelectItem>
            <SelectItem value="enabled" className="font-mono">
              Enabled
            </SelectItem>
            <SelectItem value="disabled" className="font-mono">
              Disabled
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
