// Mirrors @amarjit_gts/universal-ai-sdk's ResponseBlock union — kept as a
// local type rather than importing the SDK type directly, since only the
// API (which actually calls the SDK) needs that dependency; the web app
// just renders whatever JSON the API already returns.
export type ResponseBlock =
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };
