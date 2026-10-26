// Super Admin-only module: keys for other internal apps to read Workforce data
// over a small read-only API, with live usage stats and a request log - see
// backend/app/api/routes/api_access.py (management) and public_api.py (the API
// itself). Gated like Database Backups: stricter than Admin, and not part of
// the permission matrix since no role can be granted it.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Loader2, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { ActivityTab } from "@/components/api-access/activity-tab";
import { DocsTab } from "@/components/api-access/docs-tab";
import { CreateKeyDialog, KeysTab } from "@/components/api-access/keys-tab";
import { OverviewTab } from "@/components/api-access/overview-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadApiGuide } from "@/lib/api-guide-docx";
import { getEffectiveRole, isSuperAdminRole } from "@/lib/permissions";
import { useCurrentAccount } from "@/lib/session";

export const Route = createFileRoute("/api-access")({
  head: () => ({
    meta: [
      { title: "API Access — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Super Admin-only: API keys and usage for read-only employee data access.",
      },
    ],
  }),
  component: ApiAccessPage,
});

const TITLE = "API Access";
const DESCRIPTION = "Let other internal apps read employee data. Read-only, keyed, and revocable.";

type Tab = "overview" | "keys" | "activity" | "docs";

function ApiAccessPage() {
  const { data: account, isLoading } = useCurrentAccount();
  const isSuperAdmin = isSuperAdminRole(getEffectiveRole(account));
  const [tab, setTab] = useState<Tab>("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadApiGuide();
    } catch (error) {
      console.error(error);
      toast.error("Couldn't build the guide. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Super Admins only</p>
              <p className="text-sm text-muted-foreground">
                API keys open employee data to other systems, so only a Super Admin can manage them.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Download guide (.docx)
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create API key
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {tab === "overview" && <OverviewTab onOpenActivity={() => setTab("activity")} />}
        {tab === "keys" && <KeysTab onCreate={() => setCreateOpen(true)} />}
        {tab === "activity" && <ActivityTab />}
        {tab === "docs" && <DocsTab />}
      </div>

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
