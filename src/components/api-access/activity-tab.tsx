// Every request made to the public API: who (which key), what, and how it went.

import { useState } from "react";
import { Activity } from "lucide-react";

import { formatDateTime } from "@/components/api-access/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiKeysQuery, useApiRequestsQuery } from "@/data/api-access-store";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const ALL = "all";

export function ActivityTab() {
  const { data: keys = [] } = useApiKeysQuery();
  const [keyId, setKeyId] = useState(ALL);
  const [outcome, setOutcome] = useState(ALL);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError } = useApiRequestsQuery({
    keyId: keyId === ALL ? undefined : keyId,
    outcome: outcome === ALL ? undefined : (outcome as "ok" | "error"),
    limit: PAGE_SIZE,
    offset,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          value={keyId}
          onValueChange={(value) => {
            setKeyId(value);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-52" aria-label="Filter by key">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All keys</SelectItem>
            {keys.map((key) => (
              <SelectItem key={key.id} value={key.id}>
                {key.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={outcome}
          onValueChange={(value) => {
            setOutcome(value);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by result">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All results</SelectItem>
            <SelectItem value="ok">Succeeded</SelectItem>
            <SelectItem value="error">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">Couldn't load API activity.</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Activity className="h-9 w-9 text-muted-foreground" />
              <p className="font-medium">No requests to show</p>
              <p className="text-sm text-muted-foreground">
                Requests made with an API key will appear here as they happen.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead>From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        {row.keyName ?? <span className="text-muted-foreground">No valid key</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.method} {row.path}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono",
                            row.statusCode < 400
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-destructive/40 bg-destructive/10 text-destructive",
                          )}
                        >
                          {row.statusCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.durationMs} ms
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.clientIp ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {total > 0 && (
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of{" "}
                {total.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
