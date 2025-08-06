// src\components\utils\hljs-6ar.js
export default function hljs6ar(hljs) {
  const COMMANDS = /\b(?:MoveL|MoveJ|Home|LOG|Counter)\b/;
  const MODES    = /\b(?:Cartesian|Joint)\b/;
  const PARAMS   = /\b(?:Speed|STEP|INIT|INC|TO)\b/;
  const VARS     = /\b[A-Z][A-Z0-9_]*\b/;  // all-caps identifiers

  return {
    name: "6AR",
    case_insensitive: false,
    keywords: {
      keyword: "CONST VAR PROC ENDPROC FOR ENDFOR IF THEN ELSE ENDIF"
    },
    contains: [
      hljs.COMMENT("//", "$"),
      hljs.C_BLOCK_COMMENT_MODE,

      // 1️⃣ Commands
      {
        className: "keyword",
        begin: COMMANDS
      },

      // 2️⃣ Modes (italicize)
      {
        className: "emphasis",
        begin: MODES
      },

      // 3️⃣ Parameters
      {
        className: "attribute",
        begin: PARAMS
      },

      // 4️⃣ Variable names
      {
        className: "variable",
        begin: VARS
      },

      // Strings & numbers & parens
      {
        className: "string",
        begin: /"/,
        end: /"/
      },
      {
        className: "number",
        variants: [
          { begin: /\b-?\d+(\.\d+)?\b/ }
        ]
      },
      {
        className: "params",
        begin: /\(/,
        end: /\)/
      }
    ]
  };
}