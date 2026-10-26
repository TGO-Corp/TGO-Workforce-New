// The in-app reference for whoever is building against the API. Content comes
// from @/lib/api-docs, the same source as the downloadable guide.

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock, CopyButton } from "@/components/api-access/shared";
import {
  API_ENDPOINTS,
  SAMPLE_EMPLOYEE,
  STATUS_MEANINGS,
  curlExample,
  fetchExample,
  publicApiBase,
} from "@/lib/api-docs";

export function DocsTab() {
  const base = publicApiBase();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting started</CardTitle>
          <CardDescription>
            A read-only API: apps can look data up, never change it. Create a key on the Keys tab,
            then send it with every request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">Base URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs">
                {base}
              </code>
              <CopyButton text={base} />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Authentication</p>
            <p className="mb-2 text-sm text-muted-foreground">
              Send the key in either header. Keep it secret: anyone holding it can read the datasets
              it was issued for.
            </p>
            <CodeBlock code={"Authorization: Bearer YOUR_API_KEY\nX-API-Key: YOUR_API_KEY"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoints</CardTitle>
          <CardDescription>
            Each endpoint needs a key that was issued access to its dataset.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {API_ENDPOINTS.map((endpoint) => (
            <div
              key={endpoint.path}
              className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono">
                  {endpoint.method}
                </Badge>
                <code className="font-mono text-sm">{endpoint.path}</code>
                <Badge variant="outline" className="ml-auto">
                  Dataset: {endpoint.scope}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{endpoint.summary}</p>
              {endpoint.params.length > 0 && (
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
                  {endpoint.params.map((param) => (
                    <div key={param.name} className="contents">
                      <dt className="font-mono text-xs">{param.name}</dt>
                      <dd className="text-muted-foreground">{param.description}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Examples</CardTitle>
            <CardDescription>Active employees, 50 at a time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CodeBlock code={curlExample(base)} />
            <CodeBlock code={fetchExample(base)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sample employee</CardTitle>
            <CardDescription>What one record looks like.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={SAMPLE_EMPLOYEE} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {STATUS_MEANINGS.map((status) => (
            <div key={status.code} className="flex items-baseline gap-3 text-sm">
              <Badge variant="outline" className="font-mono">
                {status.code}
              </Badge>
              <span className="text-muted-foreground">{status.meaning}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
