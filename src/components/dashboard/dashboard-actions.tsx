// The buttons in the Dashboard's page header: Import (when allowed), Open
// directory, and the "Export All Data" menu. Owns the export's busy state and
// download; the page supplies what to export. Moved out of src/routes/index.tsx
// unchanged.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ImportEmployeesDialog } from "@/components/import-employees-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportAnalyticsPdf,
  exportAnalyticsXlsx,
  type AnalyticsExportData,
} from "@/lib/analytics-export";

export function DashboardActions({
  canManage,
  buildExportData,
}: {
  canManage: boolean;
  /** Called when an export is requested, so it always reflects the latest data. */
  buildExportData: () => AnalyticsExportData;
}) {
  const [exporting, setExporting] = useState(false);

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const data = buildExportData();
      if (format === "xlsx") await exportAnalyticsXlsx(data, "TGO_Dashboard_Full_Export");
      else await exportAnalyticsPdf(data, "TGO_Dashboard_Full_Export");
      toast.success(`All data exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canManage && <ImportEmployeesDialog />}
      <Button asChild size="sm" variant="outline">
        <Link to="/directory">
          Open directory <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export All Data
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={exporting} onSelect={() => handleExport("xlsx")}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as Excel
          </DropdownMenuItem>
          <DropdownMenuItem disabled={exporting} onSelect={() => handleExport("pdf")}>
            <FileText className="mr-2 h-4 w-4" /> Export as PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
