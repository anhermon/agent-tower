import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ModuleDefinition } from "@/types/control-plane";

type PageHeaderProps = {
  module: ModuleDefinition;
  action?: string;
};

export function PageHeader({ module, action = "Refresh" }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="eyebrow">Module</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink md:text-[34px]">
            {module.label}
          </h1>
          <Badge state={module.status} />
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{module.description}</p>
      </div>
      <div className="flex h-10 shrink-0 items-center gap-2">
        <Button>{action}</Button>
        <Button variant="primary">New check</Button>
      </div>
    </header>
  );
}
