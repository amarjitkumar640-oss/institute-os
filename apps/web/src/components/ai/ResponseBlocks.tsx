import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { InlineText } from "./InlineText";
import type { ResponseBlock } from "./types";

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-xl font-bold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
};

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadTableAsCsv(headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "table.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <TableHead key={i}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>
                  <InlineText text={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="outline" size="sm" onClick={() => downloadTableAsCsv(headers, rows)}>
        <Download className="h-3.5 w-3.5" />
        Download CSV
      </Button>
    </div>
  );
}

export function ResponseBlocks({ blocks }: { blocks: ResponseBlock[] }) {
  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <p key={i} className={HEADING_CLASS[block.level]}>
                <InlineText text={block.text} />
              </p>
            );
          case "paragraph":
            return (
              <p key={i} className="whitespace-pre-wrap">
                <InlineText text={block.text} />
              </p>
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag key={i} className={block.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineText text={item} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case "table":
            return <TableBlock key={i} headers={block.headers} rows={block.rows} />;
        }
      })}
    </div>
  );
}
