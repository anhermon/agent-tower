import { Badge } from "@/components/ui/badge";

import type { PlaceholderRecord } from "@/types/control-plane";

interface DataTableProps {
  rows: PlaceholderRecord[];
}

export function DataTable({ rows }: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-control">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-soft text-xs uppercase text-muted">
            <tr>
              <th className="w-40 px-4 py-3 font-semibold">ID</th>
              <th className="min-w-56 px-4 py-3 font-semibold">Name</th>
              <th className="w-36 px-4 py-3 font-semibold">Status</th>
              <th className="w-36 px-4 py-3 font-semibold">Owner</th>
              <th className="w-32 px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-soft">
                <td className="px-4 py-4 font-mono text-xs text-muted">{row.id}</td>
                <td className="px-4 py-4 font-medium text-ink">{row.name}</td>
                <td className="px-4 py-4">
                  <Badge state={row.status} />
                </td>
                <td className="px-4 py-4 text-muted">{row.owner}</td>
                <td className="px-4 py-4 text-muted">{row.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
