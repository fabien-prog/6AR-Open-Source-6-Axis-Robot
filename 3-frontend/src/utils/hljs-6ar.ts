// src/components/utils/hljs-6ar.ts
import type { HLJSApi, Language } from "highlight.js";

export default function hljs6ar(hljs: HLJSApi): Language {
  const COMMANDS = /\b(?:MoveL|MoveJ|Home|LOG|Counter|SetDO|WaitDI)\b/;
  const MODES = /\b(?:Cartesian|Joint)\b/;
  const PARAMS = /\b(?:Speed|STEP|INIT|INC|TO)\b/;
  const VARS = /\b[A-Z][A-Z0-9_]*\b/; // all-caps identifiers

  return {
    name: "6AR",
    case_insensitive: false,
    keywords: {
      keyword: "CONST VAR PROC ENDPROC FOR ENDFOR IF THEN ELSE ENDIF",
    },
    contains: [
      hljs.COMMENT("//", "$"),
      hljs.C_BLOCK_COMMENT_MODE,

      // Commands
      { className: "keyword", begin: COMMANDS },

      // Modes (italicize)
      { className: "emphasis", begin: MODES },

      // Parameters
      { className: "attribute", begin: PARAMS },

      // Variable names
      { className: "variable", begin: VARS },

      // Strings
      { className: "string", begin: /"/, end: /"/ },

      // Numbers
      {
        className: "number",
        variants: [{ begin: /\b-?\d+(\.\d+)?\b/ }],
      },

      // Parens contents
      { className: "params", begin: /\(/, end: /\)/ },
    ],
  };
}
