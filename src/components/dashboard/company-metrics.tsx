// The Admin/Super Admin Dashboard's row of five clickable headline cards, plus
// the detail modal each one opens (the employees behind that number). Moved out
// of src/routes/index.tsx unchanged.

import { useState } from "react";
import { Building2, Globe2, LogOut, UserPlus, Users } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { MetricDetailModal } from "@/components/metric-detail-modal";
import type { Employee } from "@/data/employees";
import { RECENT_HIRE_DAYS, RECENT_MILESTONE_DAYS } from "@/lib/dashboard-data";

type DashboardMetricKey = "active" | "newHires" | "exits" | "eastwood" | "medellin";

export function CompanyMetrics({
  employees,
  newHires,
  exits,
  counts,
}: {
  employees: Employee[];
  newHires: Employee[];
  exits: Employee[];
  counts: { active: number; eastwood: number; medellin: number };
}) {
  const [openMetric, setOpenMetric] = useState<DashboardMetricKey | null>(null);

  // The employee lists behind each clickable metric card below — same filters
  // the card's own number is computed from, just kept as arrays instead of a
  // count so the detail modal has something to show.
  const activeEmployees = employees.filter((e) => e.status === "Active");
  const eastwoodActiveEmployees = employees.filter(
    (e) => e.office === "PH Eastwood" && e.status === "Active",
  );
  const medellinActiveEmployees = employees.filter(
    (e) => e.office === "CO Medellin" && e.status === "Active",
  );

  const metricModalConfig: Record<
    DashboardMetricKey,
    { title: string; description: string; employees: Employee[]; exportBaseName: string }
  > = {
    active: {
      title: "Active Employees",
      description: "Everyone currently employed, across every hub.",
      employees: activeEmployees,
      exportBaseName: "active-employees",
    },
    newHires: {
      title: `New Hires (${RECENT_HIRE_DAYS} days)`,
      description: `Started in the last ${RECENT_HIRE_DAYS} days — still within the training window.`,
      employees: newHires,
      exportBaseName: "new-hires",
    },
    exits: {
      title: `Exits (${RECENT_MILESTONE_DAYS} days)`,
      description: `Departures across every hub in the last ${RECENT_MILESTONE_DAYS} days.`,
      employees: exits,
      exportBaseName: "exits",
    },
    eastwood: {
      title: "PH Eastwood (Active)",
      description: "Active employees at the Philippines hub.",
      employees: eastwoodActiveEmployees,
      exportBaseName: "ph-eastwood-active",
    },
    medellin: {
      title: "CO Medellin (Active)",
      description: "Active employees at the Columbia hub.",
      employees: medellinActiveEmployees,
      exportBaseName: "co-medellin-active",
    },
  };

  return (
    <>
      {/* Exactly 5 cards since Resigned/Terminated moved into their own modal —
          xl:grid-cols-5 fills one full row at wide viewports instead of leaving
          a lone orphan card on its own line. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Active Employees"
          value={counts.active}
          hint="Currently employed"
          icon={Users}
          onClick={() => setOpenMetric("active")}
        />
        <MetricCard
          title="New Hires"
          value={newHires.length}
          hint={`Started in last ${RECENT_HIRE_DAYS} days`}
          icon={UserPlus}
          onClick={() => setOpenMetric("newHires")}
        />
        <MetricCard
          title="Exits"
          value={exits.length}
          hint={`Departures in last ${RECENT_MILESTONE_DAYS} days`}
          icon={LogOut}
          onClick={() => setOpenMetric("exits")}
        />
        <MetricCard
          title="PH Eastwood (Active)"
          value={counts.eastwood}
          hint="Philippines Hub"
          icon={Building2}
          onClick={() => setOpenMetric("eastwood")}
        />
        <MetricCard
          title="CO Medellin (Active)"
          value={counts.medellin}
          hint="Columbia Hub"
          icon={Globe2}
          onClick={() => setOpenMetric("medellin")}
        />
      </div>

      {openMetric && (
        <MetricDetailModal
          open={!!openMetric}
          onOpenChange={(next) => {
            if (!next) setOpenMetric(null);
          }}
          {...metricModalConfig[openMetric]}
        />
      )}
    </>
  );
}
