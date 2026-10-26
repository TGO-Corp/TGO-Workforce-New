// Builds the "Download guide (.docx)" file on the API Access page: a short
// hand-over document a Super Admin can send to whoever is integrating. Loaded
// lazily (the docx library is large) only when the button is pressed.

import {
  API_ENDPOINTS,
  STATUS_MEANINGS,
  SAMPLE_EMPLOYEE,
  curlExample,
  fetchExample,
  publicApiBase,
} from "@/lib/api-docs";

export async function downloadApiGuide(): Promise<void> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const base = publicApiBase();

  const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
    new Paragraph({ text, heading: level, spacing: { before: 280, after: 100 } });
  const body = (text: string) => new Paragraph({ text, spacing: { after: 100 } });
  const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });
  const code = (text: string) =>
    text.split("\n").map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })],
          shading: { fill: "F1F5F9" },
        }),
    );

  const doc = new Document({
    creator: "TGO Workforce",
    title: "TGO Workforce API guide",
    sections: [
      {
        children: [
          new Paragraph({ text: "TGO Workforce API guide", heading: HeadingLevel.TITLE }),
          body(
            "A read-only, keyed HTTP API that lets other internal apps read employee data from TGO Workforce. Nothing it exposes can be changed through it.",
          ),

          heading("Base URL", HeadingLevel.HEADING_1),
          ...code(base),

          heading("Authentication", HeadingLevel.HEADING_1),
          body(
            "Every request needs an API key, issued by a Super Admin in Workforce under API Access. Send it in either header:",
          ),
          ...code("Authorization: Bearer YOUR_API_KEY\nX-API-Key: YOUR_API_KEY"),
          body(
            "Keep the key secret and out of source control. It is shown only once when created; if it leaks, ask a Super Admin to revoke it and issue a new one.",
          ),

          heading("Endpoints", HeadingLevel.HEADING_1),
          ...API_ENDPOINTS.flatMap((endpoint) => [
            heading(`${endpoint.method} ${endpoint.path}`, HeadingLevel.HEADING_2),
            body(`${endpoint.summary} Needs a key with the "${endpoint.scope}" dataset.`),
            ...endpoint.params.map((p) => bullet(`${p.name}: ${p.description}`)),
          ]),

          heading("Example", HeadingLevel.HEADING_1),
          ...code(curlExample(base)),
          new Paragraph({ text: "" }),
          ...code(fetchExample(base)),
          body("A single employee looks like this:"),
          ...code(SAMPLE_EMPLOYEE),

          heading("Responses", HeadingLevel.HEADING_1),
          ...STATUS_MEANINGS.map((s) => bullet(`${s.code}: ${s.meaning}`)),

          heading("Good practice", HeadingLevel.HEADING_1),
          bullet(
            "Page through large lists with limit and offset rather than asking for everything at once.",
          ),
          bullet("Cache results on your side where you can; employee data changes slowly."),
          bullet("Use one key per app, so activity and revocation stay clear."),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "TGO-Workforce-API-guide.docx";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
