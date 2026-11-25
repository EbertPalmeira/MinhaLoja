export interface PdfTable {
  title?: string;
  head: string[];
  body: (string | number)[][];
  foot?: (string | number)[];
  /** Column indexes aligned right (numbers/money). */
  right?: number[];
}

export interface PdfReport {
  storeName: string;
  title: string;
  period?: string;
  summary: [string, string][];
  tables: PdfTable[];
  filename: string;
  landscape?: boolean;
}

/** jsPDF's built-in fonts only cover Latin-1/WinAnsi; swap characters outside it. */
function clean(value: string | number): string | number {
  if (typeof value !== "string") return value;
  return value.replace(/[\u2212\u2013\u2014]/g, "-").replace(/[\u00a0\u202f]/g, " ");
}

/** Builds and downloads a report PDF in the browser (libraries are loaded on demand). */
export async function downloadReportPdf(report: PdfReport) {
  report = {
    ...report,
    storeName: String(clean(report.storeName)),
    title: String(clean(report.title)),
    ...(report.period ? { period: String(clean(report.period)) } : {}),
    summary: report.summary.map(([a, b]) => [String(clean(a)), String(clean(b))] as [string, string]),
    tables: report.tables.map((t) => ({
      ...t,
      ...(t.title ? { title: String(clean(t.title)) } : {}),
      head: t.head.map((h) => String(clean(h))),
      body: t.body.map((r) => r.map(clean)),
      ...(t.foot ? { foot: t.foot.map(clean) } : {}),
    })),
  };
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: report.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const green: [number, number, number] = [22, 150, 90];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(report.storeName, margin, 50);
  doc.setFontSize(13);
  doc.setTextColor(...green);
  doc.text(report.title, margin, 70);
  doc.setTextColor(80);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const generated = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  if (report.period) doc.text(`Período: ${report.period}`, margin, 86);
  doc.text(`Gerado em: ${generated}`, pageWidth - margin, 50, { align: "right" });
  doc.setTextColor(0);

  let y = report.period ? 100 : 86;

  if (report.summary.length) {
    autoTable(doc, {
      startY: y,
      body: report.summary,
      theme: "grid",
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 200 }, 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  for (const t of report.tables) {
    if (t.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(t.title, margin, y);
      y += 8;
    }
    const columnStyles: Record<number, { halign: "right" }> = {};
    (t.right ?? []).forEach((i) => (columnStyles[i] = { halign: "right" }));
    autoTable(doc, {
      startY: y,
      head: [t.head],
      body: t.body.length ? t.body : [[{ content: "Sem dados no período", colSpan: t.head.length }]],
      ...(t.foot ? { foot: [t.foot] } : {}),
      theme: "striped",
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: green, textColor: 255 },
      footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
      columnStyles,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  doc.save(report.filename);
}
